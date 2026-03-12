#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SESSION_WINDOW_OVERRIDE="${BACKEND_TMUX_TARGET:-}"
CONTROL_PANE_OVERRIDE="${CONTROL_PLANE_PANE:-}"
DATA_PANE_OVERRIDE="${DATA_PLANE_PANE:-}"
CONTROL_PLANE_HEALTH_URL="${CONTROL_PLANE_HEALTH_URL:-http://127.0.0.1:8090/health}"
DATA_PLANE_HEALTH_URL="${DATA_PLANE_HEALTH_URL:-http://127.0.0.1:8091/health}"
RESTART_TIMEOUT_SEC="${RESTART_TIMEOUT_SEC:-90}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[restart_backend_dev] missing command: $1" >&2
    exit 1
  fi
}

resolve_tmux_target() {
  local candidate
  for candidate in \
    "$SESSION_WINDOW_OVERRIDE" \
    "codex-pool:dev" \
    "codex-pool:0" \
    "codex-pool"; do
    [[ -n "$candidate" ]] || continue
    if tmux list-panes -t "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "[restart_backend_dev] could not find tmux target. Tried BACKEND_TMUX_TARGET, codex-pool:dev, codex-pool:0, codex-pool." >&2
  exit 1
}

detect_pane_index() {
  local target="$1"
  local command_name="$2"
  tmux list-panes -t "$target" -F '#{pane_index}\t#{pane_current_command}' \
    | awk -F '\t' -v want="$command_name" '$2 == want { print $1; exit }'
}

restart_pane_command() {
  local pane_target="$1"
  local command="$2"
  tmux send-keys -t "$pane_target" C-c
  sleep 1
  tmux send-keys -t "$pane_target" "cd '$REPO_ROOT' && $command" Enter
}

wait_for_health() {
  local label="$1"
  local url="$2"
  local deadline=$((SECONDS + RESTART_TIMEOUT_SEC))
  while (( SECONDS < deadline )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[restart_backend_dev] $label healthy: $url"
      return 0
    fi
    sleep 1
  done
  echo "[restart_backend_dev] timed out waiting for $label health: $url" >&2
  exit 1
}

require_cmd tmux
require_cmd curl

TMUX_TARGET="$(resolve_tmux_target)"
CONTROL_PANE_INDEX="${CONTROL_PANE_OVERRIDE:-$(detect_pane_index "$TMUX_TARGET" "control-plane")}"
DATA_PANE_INDEX="${DATA_PANE_OVERRIDE:-$(detect_pane_index "$TMUX_TARGET" "data-plane")}"

if [[ -z "$CONTROL_PANE_INDEX" ]]; then
  CONTROL_PANE_INDEX="0"
fi
if [[ -z "$DATA_PANE_INDEX" ]]; then
  DATA_PANE_INDEX="2"
fi

CONTROL_PANE_TARGET="${TMUX_TARGET}.${CONTROL_PANE_INDEX}"
DATA_PANE_TARGET="${TMUX_TARGET}.${DATA_PANE_INDEX}"

echo "[restart_backend_dev] target window: $TMUX_TARGET"
echo "[restart_backend_dev] control-plane pane: $CONTROL_PANE_TARGET"
echo "[restart_backend_dev] data-plane pane: $DATA_PANE_TARGET"

restart_pane_command "$CONTROL_PANE_TARGET" "cargo run -p control-plane --bin control-plane"
restart_pane_command "$DATA_PANE_TARGET" "cargo run -p data-plane --bin data-plane"

wait_for_health "control-plane" "$CONTROL_PLANE_HEALTH_URL"
wait_for_health "data-plane" "$DATA_PLANE_HEALTH_URL"

echo "[restart_backend_dev] restarted control-plane and data-plane successfully."
