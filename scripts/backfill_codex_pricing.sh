#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8090/api/v1/admin}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123456}"

token="$(
  curl -sS -X POST "${BASE_URL}/auth/login" \
    -H "content-type: application/json" \
    -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | jq -r ".access_token"
)"

if [[ -z "${token}" || "${token}" == "null" ]]; then
  echo "failed to get admin access token" >&2
  exit 1
fi

models="$(
  {
    curl -sS "${BASE_URL}/models" -H "authorization: Bearer ${token}" \
      | jq -r ".data[].id | select(test(\"codex\") or test(\"^gpt-5(\\\\.|$)\") or test(\"^gpt-oss-\"))"
    echo "gpt-5.3-codex"
    echo "gpt-5"
    echo "gpt-5.2"
  } | sort -u
)"

priced_models="$(
  curl -sS "${BASE_URL}/model-pricing" -H "authorization: Bearer ${token}" \
    | jq -r ".[].model" | sort -u
)"

upserted=0
skipped=0

while IFS= read -r model; do
  [[ -z "${model}" ]] && continue

  # Keep existing custom pricing; only fill missing entries.
  if echo "${priced_models}" | grep -Fxq "${model}"; then
    skipped=$((skipped + 1))
    continue
  fi

  case "${model}" in
    gpt-5.3-codex)
      input=1500000
      cached=150000
      output=6000000
      ;;
    gpt-5.2)
      input=1750000
      cached=175000
      output=14000000
      ;;
    gpt-5.1|gpt-5)
      input=1250000
      cached=125000
      output=10000000
      ;;
    gpt-oss-*)
      echo "skip ${model}: OpenAI pricing page has no official API unit price published"
      skipped=$((skipped + 1))
      continue
      ;;
    *codex-nano*)
      input=50000
      cached=5000
      output=400000
      ;;
    *codex-mini*)
      input=300000
      cached=30000
      output=1500000
      ;;
    *codex*)
      input=1250000
      cached=125000
      output=10000000
      ;;
    *)
      skipped=$((skipped + 1))
      continue
      ;;
  esac

  payload="$(
    jq -cn \
      --arg model "${model}" \
      --argjson input "${input}" \
      --argjson cached "${cached}" \
      --argjson output "${output}" \
      "{model: \$model, input_price_microcredits: \$input, cached_input_price_microcredits: \$cached, output_price_microcredits: \$output, enabled: true}"
  )"

  curl -sS -X POST "${BASE_URL}/model-pricing" \
    -H "authorization: Bearer ${token}" \
    -H "content-type: application/json" \
    -d "${payload}" \
    > /dev/null

  echo "upserted ${model} input=${input} cached=${cached} output=${output}"
  upserted=$((upserted + 1))
done <<< "${models}"

echo "summary upserted=${upserted} skipped=${skipped}"
echo "--- final pricing ---"
curl -sS "${BASE_URL}/model-pricing" -H "authorization: Bearer ${token}" \
  | jq -r "sort_by(.model)[] | \"\\(.model)\t\\(.input_price_microcredits)\t\\(.cached_input_price_microcredits)\t\\(.output_price_microcredits)\t\\(.enabled)\""
