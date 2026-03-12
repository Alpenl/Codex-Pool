#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${RUN_REAL_AI_ERROR_E2E:-0}" != "1" ]]; then
  echo "[ai_error_learning_real_e2e] PASS-SKIP: RUN_REAL_AI_ERROR_E2E is off."
  exit 0
fi

CONTROL_PLANE_BASE_URL="${AI_ERROR_E2E_CONTROL_PLANE_BASE_URL:-http://127.0.0.1:8090}"
ADMIN_USERNAME="${AI_ERROR_E2E_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${AI_ERROR_E2E_ADMIN_PASSWORD:-admin123456}"
TENANT_EMAIL="${AI_ERROR_E2E_TENANT_EMAIL:-admin@tenant.local}"
TENANT_PASSWORD="${AI_ERROR_E2E_TENANT_PASSWORD:-admin123456}"
ERROR_LEARNING_SETTINGS_URL="${CONTROL_PLANE_BASE_URL%/}/api/v1/admin/model-routing/error-learning/settings"
UPSTREAM_ERRORS_URL="${CONTROL_PLANE_BASE_URL%/}/api/v1/admin/model-routing/upstream-errors"
ENSURE_DEFAULT_TENANT_URL="${CONTROL_PLANE_BASE_URL%/}/api/v1/admin/tenants/ensure-default"
TENANT_LOGIN_URL="${CONTROL_PLANE_BASE_URL%/}/api/v1/tenant/auth/login"
TENANT_KEYS_URL="${CONTROL_PLANE_BASE_URL%/}/api/v1/tenant/keys"
ADMIN_API_KEY_GROUPS_URL="${CONTROL_PLANE_BASE_URL%/}/api/v1/admin/api-key-groups"
ADMIN_API_KEY_GROUP_POLICIES_URL="${CONTROL_PLANE_BASE_URL%/}/api/v1/admin/api-key-group-model-policies"
CODEX_BIN="${AI_ERROR_E2E_CODEX_BIN:-codex}"
CODEX_PROVIDER="${AI_ERROR_E2E_CODEX_PROVIDER:-cp}"
CODEX_MODEL="${AI_ERROR_E2E_CODEX_MODEL:-gpt-5.4-ai-error-e2e-invalid}"
CODEX_PROMPT="${AI_ERROR_E2E_CODEX_PROMPT:-请只回复“收到”。}"
SNAPSHOT_WAIT_SEC="${AI_ERROR_E2E_SNAPSHOT_WAIT_SEC:-4}"
VERIFY_TIMEOUT_SEC="${AI_ERROR_E2E_VERIFY_TIMEOUT_SEC:-30}"
KEEP_TEMP="${AI_ERROR_E2E_KEEP_TEMP:-0}"
RESTORE_SETTINGS="${AI_ERROR_E2E_RESTORE_SETTINGS:-1}"
SKIP_RESTART="${AI_ERROR_E2E_SKIP_RESTART:-0}"
CODEX_CONFIG_SOURCE_PATH="${AI_ERROR_E2E_CODEX_CONFIG_PATH:-$HOME/.codex/config.toml}"
CODEX_BEARER_TOKEN_OVERRIDE="${AI_ERROR_E2E_CODEX_BEARER_TOKEN:-}"
E2E_RECHARGE_MICROCREDITS="${AI_ERROR_E2E_RECHARGE_MICROCREDITS:-1000000000}"
E2E_MODEL_INPUT_PRICE_MICROCREDITS="${AI_ERROR_E2E_MODEL_INPUT_PRICE_MICROCREDITS:-1000}"
E2E_MODEL_CACHED_INPUT_PRICE_MICROCREDITS="${AI_ERROR_E2E_MODEL_CACHED_INPUT_PRICE_MICROCREDITS:-100}"
E2E_MODEL_OUTPUT_PRICE_MICROCREDITS="${AI_ERROR_E2E_MODEL_OUTPUT_PRICE_MICROCREDITS:-4000}"
POSTGRES_CONTAINER="${AI_ERROR_E2E_POSTGRES_CONTAINER:-codex-pool-dev-postgres-1}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ai-error-learning-e2e.XXXXXX")"
ORIGINAL_SETTINGS_FILE=""
LATEST_TEMPLATES_FILE=""
ADMIN_TOKEN=""
CODEX_HOME_DIR=""
CODEX_BEARER_TOKEN=""
TENANT_ACCESS_TOKEN=""
E2E_GROUP_ID=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ai_error_learning_real_e2e] missing command: $1" >&2
    exit 1
  fi
}

ensure_default_admin_tenant() {
  curl -fsS \
    -X POST \
    -H "authorization: Bearer $ADMIN_TOKEN" \
    "$ENSURE_DEFAULT_TENANT_URL"
}

recharge_e2e_tenant() {
  local tenant_id="$1"
  curl -fsS \
    -X POST \
    -H "authorization: Bearer $ADMIN_TOKEN" \
    -H "content-type: application/json" \
    -d "$(jq -cn --argjson amount "$E2E_RECHARGE_MICROCREDITS" --arg reason "ai error learning e2e" '{amount_microcredits: $amount, reason: $reason}')" \
    "${CONTROL_PLANE_BASE_URL%/}/api/v1/admin/tenants/${tenant_id}/credits/recharge" >/dev/null
}

login_default_tenant() {
  curl -fsS \
    -X POST \
    -H "content-type: application/json" \
    -d "$(jq -cn --arg email "$TENANT_EMAIL" --arg password "$TENANT_PASSWORD" '{email: $email, password: $password}')" \
    "$TENANT_LOGIN_URL" \
    | jq -r '.access_token // .token // empty'
}

create_e2e_api_key() {
  local key_name="ai-error-learning-e2e-$(date -u +%s)"
  curl -fsS \
    -X POST \
    -H "authorization: Bearer $TENANT_ACCESS_TOKEN" \
    -H "content-type: application/json" \
    -d "$(jq -cn --arg name "$key_name" --arg group_id "$E2E_GROUP_ID" '{name: $name, ip_allowlist: [], model_allowlist: [], group_id: $group_id}')" \
    "$TENANT_KEYS_URL"
}

create_e2e_api_key_group() {
  local group_name="AI Error E2E $(date -u +%Y%m%d-%H%M%S)"
  curl -fsS \
    -X POST \
    -H "authorization: Bearer $ADMIN_TOKEN" \
    -H "content-type: application/json" \
    -d "$(jq -cn --arg name "$group_name" '{
      name: $name,
      description: "Temporary group for AI error learning real e2e",
      enabled: true,
      is_default: false,
      allow_all_models: false,
      input_multiplier_ppm: 1000000,
      cached_input_multiplier_ppm: 1000000,
      output_multiplier_ppm: 1000000
    }')" \
    "$ADMIN_API_KEY_GROUPS_URL"
}

allow_model_for_e2e_group() {
  curl -fsS \
    -X POST \
    -H "authorization: Bearer $ADMIN_TOKEN" \
    -H "content-type: application/json" \
    -d "$(jq -cn --arg group_id "$E2E_GROUP_ID" --arg model "$CODEX_MODEL" '{
      group_id: $group_id,
      model: $model,
      enabled: true,
      input_multiplier_ppm: 1000000,
      cached_input_multiplier_ppm: 1000000,
      output_multiplier_ppm: 1000000
    }')" \
    "$ADMIN_API_KEY_GROUP_POLICIES_URL" >/dev/null
}

seed_e2e_model_catalog_entry() {
  docker exec -i "$POSTGRES_CONTAINER" \
    psql -U postgres -d codex_pool \
      -v ON_ERROR_STOP=1 \
      -v model="$CODEX_MODEL" \
      -v input_price="$E2E_MODEL_INPUT_PRICE_MICROCREDITS" \
      -v cached_price="$E2E_MODEL_CACHED_INPUT_PRICE_MICROCREDITS" \
      -v output_price="$E2E_MODEL_OUTPUT_PRICE_MICROCREDITS" <<'SQL' >/dev/null
INSERT INTO openai_models_catalog (
    model_id,
    owned_by,
    title,
    description,
    context_window_tokens,
    max_output_tokens,
    knowledge_cutoff,
    reasoning_token_support,
    input_price_microcredits,
    cached_input_price_microcredits,
    output_price_microcredits,
    pricing_notes,
    input_modalities_json,
    output_modalities_json,
    endpoints_json,
    source_url,
    raw_text,
    synced_at
)
VALUES (
    :'model',
    'e2e',
    :'model',
    'Temporary model for AI error learning real e2e',
    200000,
    8192,
    NULL,
    NULL,
    :'input_price',
    :'cached_price',
    :'output_price',
    'temporary e2e catalog seed',
    '["text"]'::jsonb,
    '["text"]'::jsonb,
    '["/v1/responses"]'::jsonb,
    'local-e2e',
    NULL,
    NOW()
)
ON CONFLICT (model_id) DO UPDATE SET
    owned_by = EXCLUDED.owned_by,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    context_window_tokens = EXCLUDED.context_window_tokens,
    max_output_tokens = EXCLUDED.max_output_tokens,
    input_price_microcredits = EXCLUDED.input_price_microcredits,
    cached_input_price_microcredits = EXCLUDED.cached_input_price_microcredits,
    output_price_microcredits = EXCLUDED.output_price_microcredits,
    pricing_notes = EXCLUDED.pricing_notes,
    input_modalities_json = EXCLUDED.input_modalities_json,
    output_modalities_json = EXCLUDED.output_modalities_json,
    endpoints_json = EXCLUDED.endpoints_json,
    source_url = EXCLUDED.source_url,
    synced_at = EXCLUDED.synced_at;
SQL
}

prepare_codex_bearer_token() {
  if [[ -n "$CODEX_BEARER_TOKEN_OVERRIDE" ]]; then
    CODEX_BEARER_TOKEN="$CODEX_BEARER_TOKEN_OVERRIDE"
    return
  fi

  local tenant_json tenant_id api_key_json
  tenant_json="$(ensure_default_admin_tenant)"
  tenant_id="$(printf '%s' "$tenant_json" | jq -r '.id // empty')"
  if [[ -z "$tenant_id" ]]; then
    echo "[ai_error_learning_real_e2e] failed to resolve default admin tenant." >&2
    exit 1
  fi

  recharge_e2e_tenant "$tenant_id"
  TENANT_ACCESS_TOKEN="$(login_default_tenant)"
  if [[ -z "$TENANT_ACCESS_TOKEN" ]]; then
    echo "[ai_error_learning_real_e2e] failed to login default admin tenant." >&2
    exit 1
  fi

  E2E_GROUP_ID="$(create_e2e_api_key_group | jq -r '.id // empty')"
  if [[ -z "$E2E_GROUP_ID" ]]; then
    echo "[ai_error_learning_real_e2e] failed to create e2e api key group." >&2
    exit 1
  fi
  seed_e2e_model_catalog_entry
  allow_model_for_e2e_group

  api_key_json="$(create_e2e_api_key)"
  CODEX_BEARER_TOKEN="$(printf '%s' "$api_key_json" | jq -r '.plaintext_key // empty')"
  if [[ -z "$CODEX_BEARER_TOKEN" ]]; then
    echo "[ai_error_learning_real_e2e] failed to create e2e api key." >&2
    exit 1
  fi
}

prepare_codex_home() {
  local source_dir
  if [[ ! -f "$CODEX_CONFIG_SOURCE_PATH" ]]; then
    echo "[ai_error_learning_real_e2e] missing codex config: $CODEX_CONFIG_SOURCE_PATH" >&2
    exit 1
  fi

  CODEX_HOME_DIR="$TMP_DIR/codex-home"
  mkdir -p "$CODEX_HOME_DIR/.codex"
  source_dir="$(cd "$(dirname "$CODEX_CONFIG_SOURCE_PATH")" && pwd)"
  cp -R "$source_dir/." "$CODEX_HOME_DIR/.codex/"

  python3 - "$CODEX_HOME_DIR/.codex/config.toml" "$CODEX_PROVIDER" "$CODEX_BEARER_TOKEN" <<'PY'
import pathlib
import re
import sys

config_path = pathlib.Path(sys.argv[1])
provider = sys.argv[2]
token = sys.argv[3]
text = config_path.read_text(encoding="utf-8")
section = f"[model_providers.{provider}]"
match = re.search(rf"(?ms)^\[model_providers\.{re.escape(provider)}\]\n(.*?)(?=^\[|\Z)", text)
if match is None:
    raise SystemExit(f"missing provider section: {section}")

body = match.group(1)
if re.search(r"(?m)^experimental_bearer_token\s*=", body):
    body = re.sub(
        r'(?m)^experimental_bearer_token\s*=.*$',
        f'experimental_bearer_token = "{token}"',
        body,
    )
else:
    body = body.rstrip() + f'\nexperimental_bearer_token = "{token}"\n'
updated = text[:match.start(1)] + body + text[match.end(1):]
config_path.write_text(updated, encoding="utf-8")
PY
}

cleanup() {
  local status=$?
  if [[ -n "$ADMIN_TOKEN" && -n "$ORIGINAL_SETTINGS_FILE" && -f "$ORIGINAL_SETTINGS_FILE" && "$RESTORE_SETTINGS" == "1" ]]; then
    local restore_payload
    restore_payload="$(jq -c '.settings | {enabled, first_seen_timeout_ms, review_hit_threshold}' "$ORIGINAL_SETTINGS_FILE" 2>/dev/null || true)"
    if [[ -n "$restore_payload" ]]; then
      curl -fsS \
        -X PUT \
        -H "authorization: Bearer $ADMIN_TOKEN" \
        -H "content-type: application/json" \
        -d "$restore_payload" \
      "$ERROR_LEARNING_SETTINGS_URL" >/dev/null 2>&1 || true
    fi
  fi

  if [[ "$KEEP_TEMP" == "1" || "$status" -ne 0 ]]; then
    echo "[ai_error_learning_real_e2e] temp dir kept at $TMP_DIR"
  else
    rm -rf "$TMP_DIR"
  fi
}

login_admin() {
  curl -fsS \
    -X POST \
    -H "content-type: application/json" \
    -d "$(jq -cn --arg username "$ADMIN_USERNAME" --arg password "$ADMIN_PASSWORD" '{username: $username, password: $password}')" \
    "${CONTROL_PLANE_BASE_URL%/}/api/v1/admin/auth/login" \
    | jq -r '.access_token // .token // empty'
}

enable_error_learning() {
  ORIGINAL_SETTINGS_FILE="$TMP_DIR/original-settings.json"
  curl -fsS \
    -H "authorization: Bearer $ADMIN_TOKEN" \
    "$ERROR_LEARNING_SETTINGS_URL" >"$ORIGINAL_SETTINGS_FILE"

  local payload
  payload="$(jq -c '.settings | {enabled: true, first_seen_timeout_ms: (.first_seen_timeout_ms // 2000), review_hit_threshold: (.review_hit_threshold // 10)}' "$ORIGINAL_SETTINGS_FILE")"
  curl -fsS \
    -X PUT \
    -H "authorization: Bearer $ADMIN_TOKEN" \
    -H "content-type: application/json" \
    -d "$payload" \
    "$ERROR_LEARNING_SETTINGS_URL" >"$TMP_DIR/enabled-settings.json"
}

recent_template_exists() {
  local file="$1"
  local started_epoch="$2"
  jq -e --argjson started "$started_epoch" '
    [
      (.templates // [])[]
      | select(.provider == "openai_compatible")
      | select((.normalized_status_code // 0) >= 400)
      | select(
          (
            (.last_seen_at // "")
            | sub("\\.[0-9]+Z$"; "Z")
            | fromdateiso8601?
          ) >= $started
        )
      | select(.status == "provisional_live" or .status == "review_pending" or .status == "approved")
    ] | length > 0
  ' "$file" >/dev/null
}

print_recent_template_summary() {
  local file="$1"
  local started_epoch="$2"
  jq -r --argjson started "$started_epoch" '
    [
      (.templates // [])[]
      | select(.provider == "openai_compatible")
      | select((.normalized_status_code // 0) >= 400)
      | select(
          (
            (.last_seen_at // "")
            | sub("\\.[0-9]+Z$"; "Z")
            | fromdateiso8601?
          ) >= $started
        )
      | {
          id,
          status,
          fingerprint,
          semantic_error_code,
          hit_count,
          last_seen_at
        }
    ] | first
  ' "$file"
}

trap cleanup EXIT

require_cmd curl
require_cmd jq
require_cmd "$CODEX_BIN"
require_cmd python3
require_cmd docker

if [[ "$SKIP_RESTART" != "1" ]]; then
  "$REPO_ROOT/scripts/restart_backend_dev.sh"
fi

ADMIN_TOKEN="$(login_admin)"
if [[ -z "$ADMIN_TOKEN" || "$ADMIN_TOKEN" == "null" ]]; then
  echo "[ai_error_learning_real_e2e] failed to obtain admin token." >&2
  exit 1
fi

enable_error_learning
prepare_codex_bearer_token
prepare_codex_home
sleep "$SNAPSHOT_WAIT_SEC"

STARTED_EPOCH="$(date -u +%s)"
CODEX_LOG_FILE="$TMP_DIR/codex.log"

set +e
HOME="$CODEX_HOME_DIR" "$CODEX_BIN" exec \
  --ephemeral \
  --skip-git-repo-check \
  --color never \
  -C "$REPO_ROOT" \
  -c "model_provider=\"$CODEX_PROVIDER\"" \
  -c "approval_policy=\"never\"" \
  -c "sandbox_mode=\"danger-full-access\"" \
  -m "$CODEX_MODEL" \
  "$CODEX_PROMPT" >"$CODEX_LOG_FILE" 2>&1
CODEX_EXIT=$?
set -e

echo "[ai_error_learning_real_e2e] codex exit code: $CODEX_EXIT"

VERIFY_DEADLINE=$((SECONDS + VERIFY_TIMEOUT_SEC))
LATEST_TEMPLATES_FILE="$TMP_DIR/upstream-errors.json"
while (( SECONDS < VERIFY_DEADLINE )); do
  curl -fsS \
    -H "authorization: Bearer $ADMIN_TOKEN" \
    "$UPSTREAM_ERRORS_URL" >"$LATEST_TEMPLATES_FILE"
  if recent_template_exists "$LATEST_TEMPLATES_FILE" "$STARTED_EPOCH"; then
    echo "[ai_error_learning_real_e2e] verified recent upstream error template:"
    print_recent_template_summary "$LATEST_TEMPLATES_FILE" "$STARTED_EPOCH"
    echo "[ai_error_learning_real_e2e] PASS"
    exit 0
  fi
  sleep 2
done

echo "[ai_error_learning_real_e2e] no recent upstream error template was observed within ${VERIFY_TIMEOUT_SEC}s." >&2
echo "[ai_error_learning_real_e2e] this usually means the live unknown-error learning path is not active yet, or the selected provider/model did not produce a learnable upstream error." >&2
echo "[ai_error_learning_real_e2e] codex log: $CODEX_LOG_FILE" >&2
exit 1
