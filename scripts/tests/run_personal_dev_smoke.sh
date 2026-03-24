#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="${REPO_ROOT}/scripts/run_personal_dev.sh"

fail() {
  echo "[run_personal_dev_smoke] $*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

[[ -f "$SCRIPT_PATH" ]] || fail "script missing: $SCRIPT_PATH"

tmp_dir="$(mktemp -d)"
stub_dir="${tmp_dir}/bin"
stdout_file="${tmp_dir}/stdout"
stderr_file="${tmp_dir}/stderr"
mkdir -p "$stub_dir"

cat >"${stub_dir}/cargo" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'cargo_stub %s\n' "$*"
STUB
chmod +x "${stub_dir}/cargo"

cat >"${tmp_dir}/.env.runtime" <<'ENVFILE'
CONTROL_PLANE_BASE_URL=http://127.0.0.1:8090
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123456
ENVFILE

(
  cd "$tmp_dir"
  env \
    PATH="${stub_dir}:$PATH" \
    HOME="$HOME" \
    PERSONAL_DEV_ENV_FILE="${tmp_dir}/.env.runtime" \
    RUST_LOG=trace \
    CONTROL_PLANE_ACTIVE_POOL_TARGET=400 \
    CONTROL_PLANE_ACTIVE_POOL_MIN=300 \
    CONTROL_PLANE_RATE_LIMIT_CACHE_REFRESH_ENABLED=true \
    CONTROL_PLANE_RATE_LIMIT_CACHE_REFRESH_INTERVAL_SEC=900 \
    bash "$SCRIPT_PATH" >"$stdout_file" 2>"$stderr_file"
)

output="$(cat "$stdout_file")"
assert_contains "$output" ".codex/data/personal/codex-pool-personal.sqlite"
assert_contains "$output" "frontend-antigravity"
assert_contains "$output" "cargo_stub run -p control-plane --no-default-features --features sqlite-backend --bin codex-pool-personal"
assert_contains "$output" "RUST_LOG=trace"
assert_contains "$output" "CONTROL_PLANE_ACTIVE_POOL_TARGET=400"
assert_contains "$output" "CONTROL_PLANE_ACTIVE_POOL_MIN=300"
assert_contains "$output" "CONTROL_PLANE_RATE_LIMIT_CACHE_REFRESH_ENABLED=true"
assert_contains "$output" "CONTROL_PLANE_RATE_LIMIT_CACHE_REFRESH_INTERVAL_SEC=900"

echo "[run_personal_dev_smoke] all checks passed"
