#!/usr/bin/env bash
set -euo pipefail

CP_BASE_URL="${CP_BASE_URL:-http://127.0.0.1:8090}"
DP_BASE_URL="${DP_BASE_URL:-http://127.0.0.1:8091}"
FORMAT="shell"
SKIP_TENANT=0
TENANT_ID=""
TENANT_NAME=""
REASON="dev-superadmin-session"

usage() {
  cat <<'EOF'
Usage: ./scripts/dev-superadmin-session.sh [options]

Options:
  --tenant-id <uuid>      Impersonate the specified tenant directly.
  --tenant-name <name>    Resolve tenant by name before impersonation.
  --reason <text>         Impersonation reason. Default: dev-superadmin-session
  --cp-base-url <url>     Control-plane base URL. Default: http://127.0.0.1:8090
  --dp-base-url <url>     Data-plane base URL. Default: http://127.0.0.1:8091
  --skip-tenant           Do not create a tenant impersonation session.
  --format <shell|json>   Output format. Default: shell
  -h, --help              Show this help.
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[dev-superadmin-session] missing command: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[dev-superadmin-session] missing environment variable: ${name}" >&2
    exit 1
  fi
}

shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

json_post() {
  local url="$1"
  local body="$2"
  shift 2
  curl -fsS -X POST "$url" "$@" \
    -H "content-type: application/json" \
    -d "$body"
}

json_get() {
  local url="$1"
  shift
  curl -fsS "$url" "$@"
}

resolve_tenant_id() {
  local tenants_json matched_count

  if [[ -n "$TENANT_ID" ]]; then
    printf '%s\n' "$TENANT_ID"
    return 0
  fi

  tenants_json="$(json_get "${CP_BASE_URL}/api/v1/admin/tenants" -H "authorization: Bearer ${CP_ADMIN_BEARER}")"

  if [[ -n "$TENANT_NAME" ]]; then
    matched_count="$(printf '%s' "$tenants_json" | jq --arg name "$TENANT_NAME" '[.[] | select(.name == $name)] | length')"
    if [[ "$matched_count" -eq 0 ]]; then
      echo "[dev-superadmin-session] tenant not found by name: ${TENANT_NAME}" >&2
      exit 1
    fi
    if [[ "$matched_count" -gt 1 ]]; then
      echo "[dev-superadmin-session] multiple tenants found for name: ${TENANT_NAME}" >&2
      exit 1
    fi
    printf '%s' "$tenants_json" | jq -r --arg name "$TENANT_NAME" '.[] | select(.name == $name) | .id'
    return 0
  fi

  matched_count="$(printf '%s' "$tenants_json" | jq 'length')"
  if [[ "$matched_count" -eq 1 ]]; then
    printf '%s' "$tenants_json" | jq -r '.[0].id'
    return 0
  fi
  if [[ "$matched_count" -eq 0 ]]; then
    echo "[dev-superadmin-session] no tenants available; specify --skip-tenant or create a tenant first" >&2
    exit 1
  fi

  echo "[dev-superadmin-session] multiple tenants found; specify --tenant-id or --tenant-name" >&2
  exit 1
}

output_shell() {
  cat <<EOF
export CP_BASE_URL=$(shell_quote "$CP_BASE_URL")
export DP_BASE_URL=$(shell_quote "$DP_BASE_URL")
export CP_ADMIN_BEARER=$(shell_quote "$CP_ADMIN_BEARER")
export CP_INTERNAL_BEARER=$(shell_quote "$CP_INTERNAL_BEARER")
export CP_TENANT_BEARER=$(shell_quote "$CP_TENANT_BEARER")
export CP_ADMIN_AUTH_HEADER=$(shell_quote "authorization: Bearer ${CP_ADMIN_BEARER}")
export CP_INTERNAL_AUTH_HEADER=$(shell_quote "authorization: Bearer ${CP_INTERNAL_BEARER}")
export CP_TENANT_AUTH_HEADER=$(shell_quote "${CP_TENANT_AUTH_HEADER}")
export CP_DEBUG_TENANT_ID=$(shell_quote "$CP_DEBUG_TENANT_ID")
export CP_IMPERSONATION_SESSION_ID=$(shell_quote "$CP_IMPERSONATION_SESSION_ID")
EOF
}

output_json() {
  jq -n \
    --arg cp_base_url "$CP_BASE_URL" \
    --arg dp_base_url "$DP_BASE_URL" \
    --arg cp_admin_bearer "$CP_ADMIN_BEARER" \
    --arg cp_internal_bearer "$CP_INTERNAL_BEARER" \
    --arg cp_tenant_bearer "$CP_TENANT_BEARER" \
    --arg cp_admin_auth_header "authorization: Bearer ${CP_ADMIN_BEARER}" \
    --arg cp_internal_auth_header "authorization: Bearer ${CP_INTERNAL_BEARER}" \
    --arg cp_tenant_auth_header "$CP_TENANT_AUTH_HEADER" \
    --arg cp_debug_tenant_id "$CP_DEBUG_TENANT_ID" \
    --arg cp_impersonation_session_id "$CP_IMPERSONATION_SESSION_ID" \
    '{
      cp_base_url: $cp_base_url,
      dp_base_url: $dp_base_url,
      cp_admin_bearer: $cp_admin_bearer,
      cp_internal_bearer: $cp_internal_bearer,
      cp_tenant_bearer: $cp_tenant_bearer,
      cp_admin_auth_header: $cp_admin_auth_header,
      cp_internal_auth_header: $cp_internal_auth_header,
      cp_tenant_auth_header: $cp_tenant_auth_header,
      cp_debug_tenant_id: $cp_debug_tenant_id,
      cp_impersonation_session_id: $cp_impersonation_session_id
    }'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tenant-id)
      TENANT_ID="${2:-}"
      shift 2
      ;;
    --tenant-name)
      TENANT_NAME="${2:-}"
      shift 2
      ;;
    --reason)
      REASON="${2:-}"
      shift 2
      ;;
    --cp-base-url)
      CP_BASE_URL="${2:-}"
      shift 2
      ;;
    --dp-base-url)
      DP_BASE_URL="${2:-}"
      shift 2
      ;;
    --skip-tenant)
      SKIP_TENANT=1
      shift
      ;;
    --format)
      FORMAT="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[dev-superadmin-session] unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$FORMAT" != "shell" && "$FORMAT" != "json" ]]; then
  echo "[dev-superadmin-session] unsupported format: ${FORMAT}" >&2
  exit 1
fi

if [[ -n "$TENANT_ID" && -n "$TENANT_NAME" ]]; then
  echo "[dev-superadmin-session] use either --tenant-id or --tenant-name, not both" >&2
  exit 1
fi

require_cmd curl
require_cmd jq
require_env ADMIN_USERNAME
require_env ADMIN_PASSWORD
require_env CONTROL_PLANE_INTERNAL_AUTH_TOKEN

admin_login_payload="$(jq -cn --arg username "$ADMIN_USERNAME" --arg password "$ADMIN_PASSWORD" '{username: $username, password: $password}')"
admin_login_json="$(json_post "${CP_BASE_URL}/api/v1/admin/auth/login" "$admin_login_payload")"
CP_ADMIN_BEARER="$(printf '%s' "$admin_login_json" | jq -re '.access_token')"
CP_INTERNAL_BEARER="${CONTROL_PLANE_INTERNAL_AUTH_TOKEN}"

CP_TENANT_BEARER=""
CP_TENANT_AUTH_HEADER=""
CP_DEBUG_TENANT_ID=""
CP_IMPERSONATION_SESSION_ID=""

if [[ "$SKIP_TENANT" -eq 0 ]]; then
  CP_DEBUG_TENANT_ID="$(resolve_tenant_id)"
  impersonation_payload="$(jq -cn --arg tenant_id "$CP_DEBUG_TENANT_ID" --arg reason "$REASON" '{tenant_id: $tenant_id, reason: $reason}')"
  impersonation_json="$(
    json_post \
      "${CP_BASE_URL}/api/v1/admin/impersonations" \
      "$impersonation_payload" \
      -H "authorization: Bearer ${CP_ADMIN_BEARER}"
  )"
  CP_TENANT_BEARER="$(printf '%s' "$impersonation_json" | jq -re '.access_token')"
  CP_IMPERSONATION_SESSION_ID="$(printf '%s' "$impersonation_json" | jq -re '.session_id')"
  CP_TENANT_AUTH_HEADER="authorization: Bearer ${CP_TENANT_BEARER}"
fi

case "$FORMAT" in
  shell)
    output_shell
    ;;
  json)
    output_json
    ;;
esac
