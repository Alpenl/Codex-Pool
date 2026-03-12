use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use codex_pool_core::api::ResolveUpstreamErrorTemplateRequest;
use codex_pool_core::model::{
    LocalizedErrorTemplates, UpstreamErrorAction, UpstreamErrorRetryScope,
};
use serde_json::{json, Value};
use tokio::sync::Mutex;

const AI_ERROR_LEARNING_BASE_URL_ENV: &str = "AI_ERROR_LEARNING_BASE_URL";
const AI_ERROR_LEARNING_API_KEY_ENV: &str = "AI_ERROR_LEARNING_API_KEY";
const AI_ERROR_LEARNING_MODEL_ENV: &str = "AI_ERROR_LEARNING_MODEL";
const AI_ERROR_LEARNING_TIMEOUT_MS_ENV: &str = "AI_ERROR_LEARNING_TIMEOUT_MS";
const AI_ERROR_LEARNING_FORCE_FALLBACK_ENV: &str = "AI_ERROR_LEARNING_FORCE_FALLBACK";
const AI_ERROR_LEARNING_MAX_NEW_PER_MIN_ENV: &str =
    "AI_ERROR_LEARNING_MAX_NEW_FINGERPRINTS_PER_MINUTE";
const DEFAULT_AI_ERROR_LEARNING_MODEL: &str = "gpt-5.2-codex";
const DEFAULT_AI_ERROR_LEARNING_TIMEOUT_MS: u64 = 2_000;
const DEFAULT_AI_ERROR_LEARNING_MAX_NEW_PER_MIN: usize = 20;

#[derive(Debug, Clone)]
pub struct GeneratedUpstreamErrorTemplate {
    pub semantic_error_code: String,
    pub action: UpstreamErrorAction,
    pub retry_scope: UpstreamErrorRetryScope,
    pub templates: LocalizedErrorTemplates,
}

#[derive(Debug, Clone)]
pub struct TemplateGenerationContext {
    pub fingerprint: String,
    pub provider: String,
    pub normalized_status_code: u16,
    pub normalized_upstream_message: String,
    pub sanitized_upstream_raw: Option<String>,
    pub model: Option<String>,
}

pub struct UpstreamErrorLearningRuntime {
    http_client: reqwest::Client,
    base_url: Option<String>,
    api_key: Option<String>,
    model: String,
    timeout: Duration,
    force_fallback: bool,
    max_new_fingerprints_per_minute: usize,
    new_fingerprint_timestamps: Mutex<VecDeque<Instant>>,
    fingerprint_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl UpstreamErrorLearningRuntime {
    pub fn from_env(default_base_url: &str) -> Self {
        let base_url = std::env::var(AI_ERROR_LEARNING_BASE_URL_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| Some(default_base_url.to_string()));
        let api_key = std::env::var(AI_ERROR_LEARNING_API_KEY_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty());
        let model = std::env::var(AI_ERROR_LEARNING_MODEL_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_AI_ERROR_LEARNING_MODEL.to_string());
        let timeout_ms = std::env::var(AI_ERROR_LEARNING_TIMEOUT_MS_ENV)
            .ok()
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or(DEFAULT_AI_ERROR_LEARNING_TIMEOUT_MS);
        let force_fallback = std::env::var(AI_ERROR_LEARNING_FORCE_FALLBACK_ENV)
            .ok()
            .is_some_and(|raw| matches!(raw.trim(), "1" | "true" | "TRUE" | "yes" | "on"));
        let max_new_fingerprints_per_minute = std::env::var(AI_ERROR_LEARNING_MAX_NEW_PER_MIN_ENV)
            .ok()
            .and_then(|raw| raw.parse::<usize>().ok())
            .unwrap_or(DEFAULT_AI_ERROR_LEARNING_MAX_NEW_PER_MIN)
            .clamp(1, 1_000);

        Self {
            http_client: reqwest::Client::new(),
            base_url,
            api_key,
            model,
            timeout: Duration::from_millis(timeout_ms.clamp(100, 10_000)),
            force_fallback,
            max_new_fingerprints_per_minute,
            new_fingerprint_timestamps: Mutex::new(VecDeque::new()),
            fingerprint_locks: Mutex::new(HashMap::new()),
        }
    }

    pub async fn lock_for_fingerprint(&self, fingerprint: &str) -> Arc<Mutex<()>> {
        let mut locks = self.fingerprint_locks.lock().await;
        locks
            .entry(fingerprint.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub async fn generate_for_locales(
        &self,
        ctx: &TemplateGenerationContext,
        locales: &[String],
        is_new_fingerprint: bool,
    ) -> GeneratedUpstreamErrorTemplate {
        let use_remote = if self.force_fallback || self.api_key.is_none() || self.base_url.is_none()
        {
            false
        } else if is_new_fingerprint {
            self.reserve_new_fingerprint_slot().await
        } else {
            true
        };

        if use_remote {
            if let Ok(generated) = self.try_generate_remote(ctx, locales).await {
                return generated;
            }
        }

        heuristic_template(ctx, locales)
    }

    async fn reserve_new_fingerprint_slot(&self) -> bool {
        let mut timestamps = self.new_fingerprint_timestamps.lock().await;
        let cutoff = Instant::now() - Duration::from_secs(60);
        while timestamps.front().is_some_and(|ts| *ts < cutoff) {
            let _ = timestamps.pop_front();
        }
        if timestamps.len() >= self.max_new_fingerprints_per_minute {
            return false;
        }
        timestamps.push_back(Instant::now());
        true
    }

    async fn try_generate_remote(
        &self,
        ctx: &TemplateGenerationContext,
        locales: &[String],
    ) -> Result<GeneratedUpstreamErrorTemplate> {
        let base_url = self.base_url.as_ref().context("missing ai base url")?;
        let api_key = self.api_key.as_ref().context("missing ai api key")?;
        let endpoint = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
        let locale_list = locales.to_vec();
        let prompt = json!({
            "fingerprint": ctx.fingerprint,
            "provider": ctx.provider,
            "normalized_status_code": ctx.normalized_status_code,
            "normalized_upstream_message": ctx.normalized_upstream_message,
            "sanitized_upstream_raw": ctx.sanitized_upstream_raw,
            "model": ctx.model,
            "target_locales": locale_list,
            "output_contract": {
                "semantic_error_code": "short snake_case string",
                "action": ["return_failure", "retry_same_account", "retry_cross_account"],
                "retry_scope": ["none", "same_account", "cross_account"],
                "templates": "object keyed by locale"
            }
        });
        let response = self
            .http_client
            .post(endpoint)
            .bearer_auth(api_key)
            .header("x-codex-internal-purpose", "upstream-error-learning")
            .header("x-codex-routing-mode", "bypass-ai")
            .timeout(self.timeout)
            .json(&json!({
                "model": self.model,
                "temperature": 0,
                "messages": [
                    {
                        "role": "system",
                        "content": "You classify upstream API errors for a gateway. Return compact JSON only with keys semantic_error_code, action, retry_scope, templates. Do not mention internal details."
                    },
                    {
                        "role": "user",
                        "content": prompt.to_string()
                    }
                ]
            }))
            .send()
            .await
            .context("failed to request remote upstream error template generation")?;
        let response = response
            .error_for_status()
            .context("remote upstream error template generation returned error status")?;
        let payload: Value = response
            .json()
            .await
            .context("failed to decode remote upstream error template response")?;
        let content = extract_completion_content(&payload)
            .ok_or_else(|| anyhow!("remote upstream error template response missing content"))?;
        let parsed: Value = serde_json::from_str(&content)
            .context("remote upstream error template content was not valid json")?;

        let semantic_error_code = parsed
            .get("semantic_error_code")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| heuristic_classification(ctx).0);
        let action = parsed
            .get("action")
            .cloned()
            .and_then(|value| serde_json::from_value::<UpstreamErrorAction>(value).ok())
            .unwrap_or_else(|| heuristic_classification(ctx).1);
        let retry_scope = parsed
            .get("retry_scope")
            .cloned()
            .and_then(|value| serde_json::from_value::<UpstreamErrorRetryScope>(value).ok())
            .unwrap_or_else(|| heuristic_classification(ctx).2);
        let mut templates = parsed
            .get("templates")
            .and_then(Value::as_object)
            .map(map_templates_from_object)
            .unwrap_or_default();
        fill_missing_templates(&mut templates, locales, &semantic_error_code);

        Ok(GeneratedUpstreamErrorTemplate {
            semantic_error_code,
            action,
            retry_scope,
            templates,
        })
    }
}

fn extract_completion_content(payload: &Value) -> Option<String> {
    let content = payload
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?;
    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }
    let parts = content.as_array()?;
    let mut merged = String::new();
    for part in parts {
        if part.get("type").and_then(Value::as_str) == Some("text") {
            if let Some(text) = part.get("text").and_then(Value::as_str) {
                merged.push_str(text);
            }
        }
    }
    if merged.trim().is_empty() {
        None
    } else {
        Some(merged)
    }
}

fn map_templates_from_object(object: &serde_json::Map<String, Value>) -> LocalizedErrorTemplates {
    let mut templates = LocalizedErrorTemplates::default();
    for (key, value) in object {
        let Some(text) = value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        assign_locale_template(&mut templates, key, text.to_string());
    }
    templates
}

fn heuristic_template(
    ctx: &TemplateGenerationContext,
    locales: &[String],
) -> GeneratedUpstreamErrorTemplate {
    let (semantic_error_code, action, retry_scope) = heuristic_classification(ctx);
    let mut templates = LocalizedErrorTemplates::default();
    fill_missing_templates(&mut templates, locales, &semantic_error_code);
    GeneratedUpstreamErrorTemplate {
        semantic_error_code,
        action,
        retry_scope,
        templates,
    }
}

fn heuristic_classification(
    ctx: &TemplateGenerationContext,
) -> (String, UpstreamErrorAction, UpstreamErrorRetryScope) {
    let message = format!(
        "{} {}",
        ctx.normalized_upstream_message,
        ctx.sanitized_upstream_raw.as_deref().unwrap_or("")
    )
    .to_ascii_lowercase();
    if ctx.normalized_status_code == 400
        && message.contains("model")
        && (message.contains("does not exist")
            || message.contains("not found")
            || message.contains("not supported")
            || message.contains("unsupported"))
    {
        return (
            "unsupported_model".to_string(),
            UpstreamErrorAction::ReturnFailure,
            UpstreamErrorRetryScope::None,
        );
    }
    if ctx.normalized_status_code == 429
        || message.contains("rate limit")
        || message.contains("too many requests")
        || message.contains("usage limit")
    {
        return (
            "quota_exhausted".to_string(),
            UpstreamErrorAction::RetryCrossAccount,
            UpstreamErrorRetryScope::CrossAccount,
        );
    }
    (
        "upstream_request_failed".to_string(),
        UpstreamErrorAction::ReturnFailure,
        UpstreamErrorRetryScope::None,
    )
}

fn fill_missing_templates(
    templates: &mut LocalizedErrorTemplates,
    locales: &[String],
    semantic_error_code: &str,
) {
    for locale in locales {
        if locale_template(templates, locale).is_some() {
            continue;
        }
        assign_locale_template(
            templates,
            locale,
            fallback_message_for_locale(semantic_error_code, locale).to_string(),
        );
    }
}

fn locale_template<'a>(templates: &'a LocalizedErrorTemplates, locale: &str) -> Option<&'a str> {
    match locale {
        "en" => templates.en.as_deref(),
        "zh-CN" | "zh_cn" | "zh-cn" => templates.zh_cn.as_deref(),
        "zh-TW" | "zh_tw" | "zh-tw" => templates.zh_tw.as_deref(),
        "ja" => templates.ja.as_deref(),
        "ru" => templates.ru.as_deref(),
        _ => None,
    }
}

fn assign_locale_template(templates: &mut LocalizedErrorTemplates, locale: &str, value: String) {
    match locale {
        "en" => templates.en = Some(value),
        "zh-CN" | "zh_cn" | "zh-cn" => templates.zh_cn = Some(value),
        "zh-TW" | "zh_tw" | "zh-tw" => templates.zh_tw = Some(value),
        "ja" => templates.ja = Some(value),
        "ru" => templates.ru = Some(value),
        _ => {}
    }
}

fn fallback_message_for_locale(semantic_error_code: &str, locale: &str) -> &'static str {
    match (semantic_error_code, locale) {
        ("unsupported_model", "zh-CN") => "请求的模型当前不可用。",
        ("unsupported_model", "zh-TW") => "請求的模型目前不可用。",
        ("unsupported_model", "ja") => "要求されたモデルは現在利用できません。",
        ("unsupported_model", "ru") => "Запрошенная модель сейчас недоступна.",
        ("unsupported_model", _) => "The requested model is not available.",
        ("quota_exhausted", "zh-CN") => "上游额度已耗尽，请稍后重试。",
        ("quota_exhausted", "zh-TW") => "上游額度已耗盡，請稍後重試。",
        ("quota_exhausted", "ja") => {
            "上流のクォータが尽きています。しばらくしてから再試行してください。"
        }
        ("quota_exhausted", "ru") => {
            "Квота на стороне апстрима исчерпана. Повторите попытку позже."
        }
        ("quota_exhausted", _) => "The upstream quota is exhausted. Please retry shortly.",
        ("upstream_request_failed", "zh-CN") => "上游请求失败，请稍后重试。",
        ("upstream_request_failed", "zh-TW") => "上游請求失敗，請稍後重試。",
        ("upstream_request_failed", "ja") => {
            "上流リクエストに失敗しました。しばらくしてから再試行してください。"
        }
        ("upstream_request_failed", "ru") => "Ошибка запроса к апстриму. Повторите попытку позже.",
        ("upstream_request_failed", _) => "The upstream request failed. Please retry later.",
        (_, "zh-CN") => "上游请求暂时不可用。",
        (_, "zh-TW") => "上游請求暫時不可用。",
        (_, "ja") => "上流リクエストは現在利用できません。",
        (_, "ru") => "Запрос к апстриму сейчас недоступен.",
        _ => "The upstream request is currently unavailable.",
    }
}

pub fn context_from_resolve_request(
    req: &ResolveUpstreamErrorTemplateRequest,
) -> TemplateGenerationContext {
    TemplateGenerationContext {
        fingerprint: req.fingerprint.clone(),
        provider: req.provider.clone(),
        normalized_status_code: req.normalized_status_code,
        normalized_upstream_message: req.normalized_upstream_message.clone(),
        sanitized_upstream_raw: req.sanitized_upstream_raw.clone(),
        model: req.model.clone(),
    }
}
