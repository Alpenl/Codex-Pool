#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8090/api/v1}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:5173}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-codex-pool-dev-postgres-1}"
NOW_TS="$(date +%s)"
START_TS="$((NOW_TS - 86400))"
END_TS="$NOW_TS"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

status_code() {
  local url="$1"
  shift || true
  curl -sS -o "$tmp_dir/resp.json" -w "%{http_code}" "$@" "$url"
}

assert_200() {
  local name="$1"
  local url="$2"
  shift 2
  local code
  code="$(status_code "$url" "$@")"
  if [[ "$code" != "200" ]]; then
    echo "[FAIL] ${name}: status=${code}"
    cat "$tmp_dir/resp.json"
    exit 1
  fi
  echo "[OK] ${name}"
}

assert_200 "frontend-ready" "$FRONTEND_URL"

admin_login_payload='{"username":"admin","password":"admin123456"}'
admin_token="$(
  curl -sS -X POST "${BASE_URL}/admin/auth/login" \
    -H "content-type: application/json" \
    -d "${admin_login_payload}" | jq -r '.access_token'
)"
[[ -n "${admin_token}" && "${admin_token}" != "null" ]]
echo "[OK] admin-login"

default_tenant_id="$(
  curl -sS -X POST "${BASE_URL}/admin/tenants/ensure-default" \
    -H "authorization: Bearer ${admin_token}" | jq -r '.id'
)"
[[ -n "${default_tenant_id}" && "${default_tenant_id}" != "null" ]]
echo "[OK] admin-default-tenant"

assert_200 "admin-dashboard-summary" \
  "${BASE_URL}/admin/usage/summary?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${admin_token}"
assert_200 "admin-dashboard-trends" \
  "${BASE_URL}/admin/usage/trends/hourly?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${admin_token}"
assert_200 "admin-logs-request" \
  "${BASE_URL}/admin/request-logs?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${admin_token}"
assert_200 "admin-logs-audit" \
  "${BASE_URL}/admin/audit-logs?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${admin_token}"
assert_200 "admin-billing-balance" \
  "${BASE_URL}/admin/tenants/${default_tenant_id}/credits/balance" \
  -H "authorization: Bearer ${admin_token}"
assert_200 "admin-billing-ledger" \
  "${BASE_URL}/admin/tenants/${default_tenant_id}/credits/ledger?limit=200" \
  -H "authorization: Bearer ${admin_token}"

curl -sS "${BASE_URL}/admin/tenants/${default_tenant_id}/credits/ledger?limit=200" \
  -H "authorization: Bearer ${admin_token}" > "$tmp_dir/admin-ledger.json"
jq -r '["id","event_type","delta_microcredits","balance_after_microcredits","created_at"], (.items[]? | [.id,.event_type,.delta_microcredits,.balance_after_microcredits,.created_at]) | @csv' \
  "$tmp_dir/admin-ledger.json" > "$tmp_dir/admin-ledger.csv"
[[ -s "$tmp_dir/admin-ledger.csv" ]]
echo "[OK] admin-csv-export-simulated"

suffix="$(date +%s)"
tenant_email="tenant-smoke-${suffix}@example.com"
tenant_name="tenant-smoke-${suffix}"
tenant_password="Password123!"

tenant_register_payload="$(
  jq -n \
    --arg tenant_name "${tenant_name}" \
    --arg email "${tenant_email}" \
    --arg password "${tenant_password}" \
    '{tenant_name:$tenant_name,email:$email,password:$password}'
)"
tenant_register_resp="$(
  curl -sS -X POST "${BASE_URL}/tenant/auth/register" \
    -H "content-type: application/json" \
    -d "${tenant_register_payload}"
)"
tenant_id="$(echo "${tenant_register_resp}" | jq -r '.tenant_id')"
tenant_user_id="$(echo "${tenant_register_resp}" | jq -r '.user_id')"
[[ -n "${tenant_id}" && "${tenant_id}" != "null" ]]
[[ -n "${tenant_user_id}" && "${tenant_user_id}" != "null" ]]
echo "[OK] tenant-register"

docker exec "${POSTGRES_CONTAINER}" psql -U postgres -d codex_pool \
  -c "UPDATE tenant_users SET email_verified = true, updated_at = NOW() WHERE id = '${tenant_user_id}'::uuid;" \
  > "$tmp_dir/tenant-verify.log"
echo "[OK] tenant-email-verified-by-db"

tenant_login_payload="$(
  jq -n --arg email "${tenant_email}" --arg password "${tenant_password}" \
    '{email:$email,password:$password}'
)"
tenant_token="$(
  curl -sS -X POST "${BASE_URL}/tenant/auth/login" \
    -H "content-type: application/json" \
    -d "${tenant_login_payload}" | jq -r '.access_token'
)"
[[ -n "${tenant_token}" && "${tenant_token}" != "null" ]]
echo "[OK] tenant-login"

assert_200 "tenant-dashboard-summary" \
  "${BASE_URL}/tenant/usage/summary?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${tenant_token}"
assert_200 "tenant-dashboard-trends" \
  "${BASE_URL}/tenant/usage/trends/hourly?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${tenant_token}"
assert_200 "tenant-logs-request" \
  "${BASE_URL}/tenant/request-logs?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${tenant_token}"
assert_200 "tenant-logs-audit" \
  "${BASE_URL}/tenant/audit-logs?start_ts=${START_TS}&end_ts=${END_TS}" \
  -H "authorization: Bearer ${tenant_token}"
assert_200 "tenant-billing-balance" \
  "${BASE_URL}/tenant/credits/balance" \
  -H "authorization: Bearer ${tenant_token}"
assert_200 "tenant-billing-ledger" \
  "${BASE_URL}/tenant/credits/ledger?limit=200" \
  -H "authorization: Bearer ${tenant_token}"

curl -sS "${BASE_URL}/tenant/credits/ledger?limit=200" \
  -H "authorization: Bearer ${tenant_token}" > "$tmp_dir/tenant-ledger.json"
jq -r '["id","event_type","delta_microcredits","balance_after_microcredits","created_at"], (.items[]? | [.id,.event_type,.delta_microcredits,.balance_after_microcredits,.created_at]) | @csv' \
  "$tmp_dir/tenant-ledger.json" > "$tmp_dir/tenant-ledger.csv"
[[ -s "$tmp_dir/tenant-ledger.csv" ]]
echo "[OK] tenant-csv-export-simulated"

echo "SMOKE_OK"
