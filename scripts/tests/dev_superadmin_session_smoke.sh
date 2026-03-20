#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="${REPO_ROOT}/scripts/dev-superadmin-session.sh"

fail() {
  echo "[dev_superadmin_session_smoke] $*" >&2
  exit 1
}

[[ -f "$SCRIPT_PATH" ]] || fail "script missing: $SCRIPT_PATH"

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" != *"$needle"* ]] || fail "expected output to not contain: $needle"
}

run_missing_env_case() {
  local stdout_file stderr_file
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if env -i PATH="$PATH" HOME="$HOME" bash "$SCRIPT_PATH" >"$stdout_file" 2>"$stderr_file"; then
    fail "expected missing env case to fail"
  fi

  local stderr_text
  stderr_text="$(cat "$stderr_file")"
  assert_contains "$stderr_text" "ADMIN_USERNAME"
}

setup_stub_dir() {
  local stub_dir="$1"
  mkdir -p "$stub_dir"
  cat >"${stub_dir}/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${DEV_SUPERADMIN_CURL_LOG:?}"
printf '%s\n' "$*" >>"$LOG_FILE"

args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
  if [[ "${args[$i]}" == "-X" ]]; then
    method="${args[$((i+1))]}"
  fi
  if [[ "${args[$i]}" == http://* || "${args[$i]}" == https://* ]]; then
    url="${args[$i]}"
  fi
done

method="${method:-GET}"
url="${url:-}"

case "${method} ${url}" in
  "POST http://127.0.0.1:8090/api/v1/admin/auth/login")
    printf '%s' '{"access_token":"admin-token","token_type":"Bearer","expires_in":28800}'
    ;;
  "GET http://127.0.0.1:8090/api/v1/admin/tenants")
    printf '%s' '[{"id":"11111111-1111-1111-1111-111111111111","name":"default","status":"active","plan":"credit","created_at":"2026-03-19T00:00:00Z","updated_at":"2026-03-19T00:00:00Z"}]'
    ;;
  "POST http://127.0.0.1:8090/api/v1/admin/impersonations")
    printf '%s' '{"session_id":"22222222-2222-2222-2222-222222222222","access_token":"tenant-token","expires_in":3600,"tenant_id":"11111111-1111-1111-1111-111111111111"}'
    ;;
  *)
    echo "unexpected curl call: ${method} ${url}" >&2
    exit 91
    ;;
esac
STUB
  chmod +x "${stub_dir}/curl"
}

run_skip_tenant_case() {
  local tmp_dir stub_dir stdout_file stderr_file curl_log output
  tmp_dir="$(mktemp -d)"
  stub_dir="${tmp_dir}/bin"
  stdout_file="${tmp_dir}/stdout"
  stderr_file="${tmp_dir}/stderr"
  curl_log="${tmp_dir}/curl.log"
  : >"$curl_log"
  setup_stub_dir "$stub_dir"

  output="$(
    env \
      PATH="${stub_dir}:$PATH" \
      HOME="$HOME" \
      ADMIN_USERNAME="admin" \
      ADMIN_PASSWORD="admin123456" \
      CONTROL_PLANE_INTERNAL_AUTH_TOKEN="cp-internal-token" \
      DEV_SUPERADMIN_CURL_LOG="$curl_log" \
      bash "$SCRIPT_PATH" --skip-tenant >"$stdout_file" 2>"$stderr_file"
    cat "$stdout_file"
  )"

  assert_contains "$output" "export CP_ADMIN_BEARER='admin-token'"
  assert_contains "$output" "export CP_INTERNAL_BEARER='cp-internal-token'"
  assert_contains "$output" "export CP_TENANT_BEARER=''"
  assert_contains "$output" "export CP_DEBUG_TENANT_ID=''"
  assert_not_contains "$(cat "$curl_log")" "/api/v1/admin/impersonations"
}

run_tenant_name_case() {
  local tmp_dir stub_dir stdout_file stderr_file curl_log output
  tmp_dir="$(mktemp -d)"
  stub_dir="${tmp_dir}/bin"
  stdout_file="${tmp_dir}/stdout"
  stderr_file="${tmp_dir}/stderr"
  curl_log="${tmp_dir}/curl.log"
  : >"$curl_log"
  setup_stub_dir "$stub_dir"

  output="$(
    env \
      PATH="${stub_dir}:$PATH" \
      HOME="$HOME" \
      ADMIN_USERNAME="admin" \
      ADMIN_PASSWORD="admin123456" \
      CONTROL_PLANE_INTERNAL_AUTH_TOKEN="cp-internal-token" \
      DEV_SUPERADMIN_CURL_LOG="$curl_log" \
      bash "$SCRIPT_PATH" --tenant-name default >"$stdout_file" 2>"$stderr_file"
    cat "$stdout_file"
  )"

  assert_contains "$output" "export CP_ADMIN_BEARER='admin-token'"
  assert_contains "$output" "export CP_TENANT_BEARER='tenant-token'"
  assert_contains "$output" "export CP_DEBUG_TENANT_ID='11111111-1111-1111-1111-111111111111'"
  assert_contains "$output" "export CP_IMPERSONATION_SESSION_ID='22222222-2222-2222-2222-222222222222'"
  assert_contains "$(cat "$curl_log")" "/api/v1/admin/tenants"
  assert_contains "$(cat "$curl_log")" "/api/v1/admin/impersonations"
}

run_missing_env_case
run_skip_tenant_case
run_tenant_name_case

echo "[dev_superadmin_session_smoke] all checks passed"
