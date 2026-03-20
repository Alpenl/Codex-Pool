#[derive(Debug, Clone)]
struct BillingPricingResolved {
    input_price_microcredits: i64,
    cached_input_price_microcredits: i64,
    output_price_microcredits: i64,
    source: String,
}

#[derive(Debug, Clone)]
struct ApiKeyGroupResolvedPricing {
    formula: BillingPricingResolved,
    final_pricing: BillingPricingResolved,
    uses_absolute_pricing: bool,
}

const BILLING_MULTIPLIER_PPM_ONE: i64 = 1_000_000;
const DEFAULT_BILLING_SESSION_TTL_SEC: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BillingRequestKind {
    Any,
    Response,
    Compact,
    Chat,
    Unknown,
}

impl BillingRequestKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Any => "any",
            Self::Response => "response",
            Self::Compact => "compact",
            Self::Chat => "chat",
            Self::Unknown => "unknown",
        }
    }

    fn from_optional(raw: Option<&str>) -> Self {
        match raw.unwrap_or("unknown").trim().to_ascii_lowercase().as_str() {
            "any" => Self::Any,
            "response" => Self::Response,
            "compact" => Self::Compact,
            "chat" => Self::Chat,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BillingPricingRuleScope {
    Request,
    Session,
}

impl BillingPricingRuleScope {
    #[cfg(test)]
    fn as_str(self) -> &'static str {
        match self {
            Self::Request => "request",
            Self::Session => "session",
        }
    }

    fn from_str(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "session" => Self::Session,
            _ => Self::Request,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BillingPricingBand {
    Base,
    LongContext,
}

impl BillingPricingBand {
    fn as_str(self) -> &'static str {
        match self {
            Self::Base => "base",
            Self::LongContext => "long_context",
        }
    }

    fn from_optional(raw: Option<&str>) -> Self {
        match raw.unwrap_or("base").trim().to_ascii_lowercase().as_str() {
            "long_context" => Self::LongContext,
            _ => Self::Base,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BillingResolutionPhase {
    Authorize,
    Capture,
}

struct BillingPricingRequestContext<'a> {
    service_tier: Option<&'a str>,
    api_key_id: Option<Uuid>,
    request_kind: BillingRequestKind,
    persisted_band: Option<BillingPricingBand>,
    actual_input_tokens: Option<i64>,
    phase: BillingResolutionPhase,
}

#[derive(Debug, Clone)]
struct BillingPricingDecision {
    pricing: BillingPricingResolved,
    band: BillingPricingBand,
    matched_rule_id: Option<Uuid>,
}

fn default_billing_authorization_ttl_sec() -> u64 {
    std::env::var("BILLING_AUTHORIZATION_TTL_SEC")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(DEFAULT_BILLING_AUTHORIZATION_TTL_SEC)
}

fn billing_pricing_fallback_enabled() -> bool {
    billing_parse_bool_env("BILLING_PRICING_FALLBACK_ENABLED").unwrap_or(true)
}

fn billing_default_input_price_microcredits() -> Option<i64> {
    parse_i64_env_positive("BILLING_DEFAULT_INPUT_PRICE_MICROCREDITS")
}

fn billing_default_output_price_microcredits() -> Option<i64> {
    parse_i64_env_positive("BILLING_DEFAULT_OUTPUT_PRICE_MICROCREDITS")
}

fn billing_default_cached_input_price_microcredits() -> Option<i64> {
    parse_i64_env_non_negative("BILLING_DEFAULT_CACHED_INPUT_PRICE_MICROCREDITS")
}

fn parse_i64_env_positive(key: &str) -> Option<i64> {
    std::env::var(key)
        .ok()
        .and_then(|raw| raw.parse::<i64>().ok())
        .filter(|value| *value > 0)
}

fn parse_i64_env_non_negative(key: &str) -> Option<i64> {
    std::env::var(key)
        .ok()
        .and_then(|raw| raw.parse::<i64>().ok())
        .filter(|value| *value >= 0)
}

fn billing_parse_bool_env(key: &str) -> Option<bool> {
    std::env::var(key).ok().and_then(|raw| {
        let normalized = raw.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        }
    })
}

fn normalize_cached_input_price_microcredits(input_price: i64, cached_input_price: i64) -> i64 {
    if cached_input_price <= 0 {
        return input_price.max(0);
    }
    cached_input_price
}

fn normalize_billing_service_tier(raw: Option<&str>) -> String {
    match raw
        .unwrap_or("default")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "priority" | "fast" => "priority".to_string(),
        "flex" => "flex".to_string(),
        _ => "default".to_string(),
    }
}

fn pricing_override_lookup_tiers(service_tier: &str) -> Vec<&str> {
    match service_tier {
        "priority" => vec!["priority", "default"],
        "flex" => vec!["flex", "default"],
        _ => vec!["default"],
    }
}

fn resolve_effective_pricing_for_band(
    base: &BillingPricingResolved,
    rules: &[BillingPricingRuleRecord],
    model: &str,
    request_kind: BillingRequestKind,
    persisted_band: Option<BillingPricingBand>,
    actual_input_tokens: Option<i64>,
    phase: BillingResolutionPhase,
) -> BillingPricingDecision {
    let normalized_input_tokens = actual_input_tokens.map(|value| value.max(0));
    let matching_rules = rules
        .iter()
        .filter(|rule| {
            billing_rule_matches_model(&rule.model_pattern, model)
                && billing_rule_matches_request_kind(&rule.request_kind, request_kind)
        })
        .collect::<Vec<_>>();

    let band = match persisted_band {
        Some(BillingPricingBand::LongContext) => BillingPricingBand::LongContext,
        _ => matching_rules
            .iter()
            .find(|rule| {
                let threshold = rule.threshold_input_tokens.unwrap_or(0).max(0);
                let threshold_reached = normalized_input_tokens.unwrap_or(0) >= threshold;
                match BillingPricingRuleScope::from_str(&rule.scope) {
                    BillingPricingRuleScope::Session => {
                        phase == BillingResolutionPhase::Capture && threshold_reached
                    }
                    BillingPricingRuleScope::Request => threshold_reached,
                }
            })
            .map(|_| BillingPricingBand::LongContext)
            .unwrap_or(BillingPricingBand::Base),
    };

    let matched_rule = if band == BillingPricingBand::LongContext {
        matching_rules.first().copied()
    } else {
        None
    };

    let pricing = if let Some(rule) = matched_rule {
        BillingPricingResolved {
            input_price_microcredits: apply_multiplier_ppm(
                base.input_price_microcredits,
                rule.input_multiplier_ppm,
            ),
            cached_input_price_microcredits: apply_multiplier_ppm(
                base.cached_input_price_microcredits,
                rule.cached_input_multiplier_ppm,
            ),
            output_price_microcredits: apply_multiplier_ppm(
                base.output_price_microcredits,
                rule.output_multiplier_ppm,
            ),
            source: format!("{}+rule:{}", base.source, rule.id),
        }
    } else {
        base.clone()
    };

    BillingPricingDecision {
        pricing,
        band,
        matched_rule_id: matched_rule.map(|rule| rule.id),
    }
}

fn billing_rule_matches_model(model_pattern: &str, model: &str) -> bool {
    let normalized_pattern = model_pattern.trim();
    if normalized_pattern.is_empty() {
        return false;
    }
    if normalized_pattern == model {
        return true;
    }
    normalized_pattern
        .strip_suffix('*')
        .map(|prefix| !prefix.is_empty() && model.starts_with(prefix))
        .unwrap_or(false)
}

fn billing_rule_matches_request_kind(
    rule_request_kind: &str,
    request_kind: BillingRequestKind,
) -> bool {
    let rule_kind = BillingRequestKind::from_optional(Some(rule_request_kind));
    rule_kind == BillingRequestKind::Any || rule_kind == request_kind
}

fn apply_multiplier_ppm(price_microcredits: i64, multiplier_ppm: i64) -> i64 {
    let numerator = (price_microcredits.max(0) as i128)
        .saturating_mul(multiplier_ppm.max(0) as i128)
        .saturating_add((BILLING_MULTIPLIER_PPM_ONE / 2) as i128);
    (numerator / BILLING_MULTIPLIER_PPM_ONE as i128).clamp(0, i64::MAX as i128) as i64
}

fn policy_has_absolute_pricing(policy: Option<&ApiKeyGroupModelPolicyRecord>) -> bool {
    policy.is_some_and(|item| {
        item.input_price_microcredits.is_some()
            && item.cached_input_price_microcredits.is_some()
            && item.output_price_microcredits.is_some()
    })
}

fn apply_api_key_group_model_pricing(
    base: &BillingPricingResolved,
    group: &ApiKeyGroupRecord,
    policy: Option<&ApiKeyGroupModelPolicyRecord>,
) -> ApiKeyGroupResolvedPricing {
    let formula = BillingPricingResolved {
        input_price_microcredits: apply_multiplier_ppm(
            apply_multiplier_ppm(base.input_price_microcredits, group.input_multiplier_ppm),
            policy
                .map(|item| item.input_multiplier_ppm)
                .unwrap_or(BILLING_MULTIPLIER_PPM_ONE),
        ),
        cached_input_price_microcredits: apply_multiplier_ppm(
            apply_multiplier_ppm(
                base.cached_input_price_microcredits,
                group.cached_input_multiplier_ppm,
            ),
            policy
                .map(|item| item.cached_input_multiplier_ppm)
                .unwrap_or(BILLING_MULTIPLIER_PPM_ONE),
        ),
        output_price_microcredits: apply_multiplier_ppm(
            apply_multiplier_ppm(base.output_price_microcredits, group.output_multiplier_ppm),
            policy
                .map(|item| item.output_multiplier_ppm)
                .unwrap_or(BILLING_MULTIPLIER_PPM_ONE),
        ),
        source: format!("{}+group_formula:{}", base.source, group.id),
    };

    if let Some(item) = policy.filter(|_| policy_has_absolute_pricing(policy)) {
        return ApiKeyGroupResolvedPricing {
            formula,
            final_pricing: BillingPricingResolved {
                input_price_microcredits: item.input_price_microcredits.unwrap_or(0),
                cached_input_price_microcredits: item
                    .cached_input_price_microcredits
                    .unwrap_or(0),
                output_price_microcredits: item.output_price_microcredits.unwrap_or(0),
                source: format!("{}+group_absolute:{}", base.source, item.id),
            },
            uses_absolute_pricing: true,
        };
    }

    ApiKeyGroupResolvedPricing {
        formula: formula.clone(),
        final_pricing: formula,
        uses_absolute_pricing: false,
    }
}

fn authorization_meta_string(meta_json: Option<&serde_json::Value>, key: &str) -> Option<String> {
    meta_json
        .and_then(|value| value.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn authorization_pricing_band(meta_json: Option<&serde_json::Value>) -> Option<BillingPricingBand> {
    authorization_meta_string(meta_json, "pricing_band")
        .map(|raw| BillingPricingBand::from_optional(Some(raw.as_str())))
}

fn authorization_request_kind(meta_json: Option<&serde_json::Value>) -> Option<BillingRequestKind> {
    let request_kind = BillingRequestKind::from_optional(
        authorization_meta_string(meta_json, "request_kind").as_deref(),
    );
    if request_kind == BillingRequestKind::Unknown {
        None
    } else {
        Some(request_kind)
    }
}

fn authorization_session_key(meta_json: Option<&serde_json::Value>) -> Option<String> {
    authorization_meta_string(meta_json, "session_key")
}

fn authorization_service_tier(meta_json: Option<&serde_json::Value>) -> Option<String> {
    authorization_meta_string(meta_json, "service_tier")
        .map(|raw| normalize_billing_service_tier(Some(raw.as_str())))
}
