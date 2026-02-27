#!/usr/bin/env bash
set -euo pipefail

# 用法：
#   CP_URL=http://127.0.0.1:8090 \
#   ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123456 \
#   ./scripts/benchmark_oauth_import.sh 50000
#
# 说明：
# - 脚本会生成 N 条 JSONL 凭据并调用批量导入接口。
# - 默认使用模拟 refresh_token，通常会走 failed 路径；主要用于评估导入流水线吞吐。

CP_URL="${CP_URL:-http://127.0.0.1:8090}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123456}"
RECORDS="${1:-50000}"
WORKDIR="${TMPDIR:-/tmp}/codex-pool-bench-$$"

mkdir -p "${WORKDIR}"
trap 'rm -rf "${WORKDIR}"' EXIT

if ! command -v jq >/dev/null 2>&1; then
  echo "缺少 jq，请先安装 jq" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "缺少 curl，请先安装 curl" >&2
  exit 1
fi

JSONL_PATH="${WORKDIR}/bench.jsonl"

echo "生成测试数据: ${RECORDS} 条 -> ${JSONL_PATH}"
for ((i=1; i<=RECORDS; i++)); do
  printf '{"email":"bench-%06d@example.com","account_id":"acct-%06d","refresh_token":"rt_bench_%06d"}\n' "${i}" "${i}" "${i}" >> "${JSONL_PATH}"
done

echo "管理员登录..."
ADMIN_TOKEN="$(curl -fsS -X POST "${CP_URL}/api/v1/admin/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" | jq -r '.access_token')"

if [[ -z "${ADMIN_TOKEN}" || "${ADMIN_TOKEN}" == "null" ]]; then
  echo "管理员登录失败，未拿到 access_token" >&2
  exit 1
fi

echo "创建导入任务..."
CREATE_RESPONSE="$(curl -fsS -X POST "${CP_URL}/api/v1/upstream-accounts/oauth/import-jobs" \
  -H "authorization: Bearer ${ADMIN_TOKEN}" \
  -F "files[]=@${JSONL_PATH}" \
  -F "mode=chat_gpt_session" \
  -F "base_url=https://chatgpt.com/backend-api/codex" \
  -F "default_priority=100" \
  -F "default_enabled=true")"

JOB_ID="$(echo "${CREATE_RESPONSE}" | jq -r '.job_id')"
if [[ -z "${JOB_ID}" || "${JOB_ID}" == "null" ]]; then
  echo "创建任务失败: ${CREATE_RESPONSE}" >&2
  exit 1
fi

echo "任务已创建: ${JOB_ID}"
START_TS="$(date +%s)"

SUMMARY_JSON=''
while true; do
  SUMMARY_JSON="$(curl -fsS -H "authorization: Bearer ${ADMIN_TOKEN}" \
    "${CP_URL}/api/v1/upstream-accounts/oauth/import-jobs/${JOB_ID}")"
  STATUS="$(echo "${SUMMARY_JSON}" | jq -r '.status')"
  PROCESSED="$(echo "${SUMMARY_JSON}" | jq -r '.processed')"
  TOTAL="$(echo "${SUMMARY_JSON}" | jq -r '.total')"
  echo "status=${STATUS} processed=${PROCESSED}/${TOTAL}"

  if [[ "${STATUS}" == "completed" || "${STATUS}" == "failed" || "${STATUS}" == "cancelled" ]]; then
    break
  fi
  sleep 1
done

END_TS="$(date +%s)"
ELAPSED_SEC="$((END_TS - START_TS))"
if [[ "${ELAPSED_SEC}" -le 0 ]]; then
  ELAPSED_SEC=1
fi

PROCESSED="$(echo "${SUMMARY_JSON}" | jq -r '.processed')"
CREATED_COUNT="$(echo "${SUMMARY_JSON}" | jq -r '.created_count')"
UPDATED_COUNT="$(echo "${SUMMARY_JSON}" | jq -r '.updated_count')"
FAILED_COUNT="$(echo "${SUMMARY_JSON}" | jq -r '.failed_count')"
REPORTED_TPM="$(echo "${SUMMARY_JSON}" | jq -r '.throughput_per_min // empty')"
CALC_TPM="$((PROCESSED * 60 / ELAPSED_SEC))"

echo "================ BENCH RESULT ================"
echo "job_id            : ${JOB_ID}"
echo "elapsed_sec       : ${ELAPSED_SEC}"
echo "processed         : ${PROCESSED}"
echo "created/updated   : ${CREATED_COUNT}/${UPDATED_COUNT}"
echo "failed            : ${FAILED_COUNT}"
if [[ -n "${REPORTED_TPM}" ]]; then
  echo "throughput(min)   : ${REPORTED_TPM} (server)"
fi
echo "throughput(min)   : ${CALC_TPM} (client-calc)"
echo "=============================================="
