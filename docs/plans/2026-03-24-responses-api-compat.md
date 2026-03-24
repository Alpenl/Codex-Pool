# Responses API Compatibility Matrix and Continuation Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repository-owned Responses API compatibility matrix and harden `previous_response_id` continuation behavior across HTTP, WS, and compact paths without regressing the existing Codex proxy mainline.

**Architecture:** Keep the current Codex compatibility layer intact for routing, stream bridging, and field normalization, but make continuation handling first-class. Preserve the default `store` omission semantics for `/v1/responses`, reuse the existing websocket stale-anchor recovery strategy for HTTP/compact, and document support levels in a dedicated compatibility matrix.

**Tech Stack:** Rust, Axum, Tokio, reqwest, tokio-tungstenite, existing `services/data-plane` compatibility test suites, Markdown docs.

---

## Progress

- [x] Task 1: Write the compatibility matrix document skeleton and source-of-truth rules
- [x] Task 2: Add failing HTTP continuation regression tests
- [x] Task 3: Add failing compact continuation regression tests
- [x] Task 4: Implement continuation-aware request adaptation and same-account recovery
- [x] Task 5: Update compatibility matrix with verified support levels
- [x] Task 6: Run full verification and summarize results

### Task 1: Write the compatibility matrix document skeleton and source-of-truth rules

**Files:**
- Create: `docs/responses-api-compatibility-matrix.md`
- Modify: `README.md` (only if needed for link/discoverability)

**Step 1: Draft the matrix structure**

- Add sections for:
  - endpoints
  - capability rows
  - Codex profile rewrite rules
  - known gaps / caveats

**Step 2: Keep support labels evidence-based**

- Use only:
  - `supported`
  - `adapted`
  - `conditional`
  - `known-gap`

**Step 3: Do not overclaim**

- Mark anything still pending implementation or not yet regression-tested as `known-gap` until verification is complete.

### Task 2: Add failing HTTP continuation regression tests

**Files:**
- Modify: `services/data-plane/tests/compatibility.rs`

**Step 1: Write a failing test for stale `previous_response_id` recovery**

- Simulate a Codex upstream that:
  - first returns an error payload indicating `previous_response_not_found`
  - then succeeds when the retried request omits `previous_response_id`
- Assert:
  - proxy returns success to the downstream caller
  - two upstream requests were made to the same account
  - second forwarded body omits `previous_response_id`

**Step 2: Write a failing test for continuation-aware `store` behavior**

- Send a Codex-profile `/v1/responses` request containing `previous_response_id`.
- Assert the forwarded request preserves the continuation anchor and does not forcibly inject `store=false`.
- Add a two-turn regression asserting first-turn default omission of `store` still allows the second turn to continue without a stale-anchor retry.

**Step 3: Run the targeted test command and verify RED**

Run: `cargo test -p data-plane compatibility -- --nocapture`

Expected: the new continuation tests fail on current code.

### Task 3: Add failing compact continuation regression tests

**Files:**
- Modify: `services/data-plane/tests/compatibility.rs`

**Step 1: Write a failing compact continuation recovery test**

- Simulate `/v1/responses/compact` with a stale `previous_response_id`.
- Assert the proxy retries without the stale anchor and preserves the compact route.

**Step 2: Run the same targeted suite and verify RED**

Run: `cargo test -p data-plane compatibility -- --nocapture`

Expected: the new compact continuation test fails on current code.

### Task 4: Implement continuation-aware request adaptation and same-account recovery

**Files:**
- Modify: `services/data-plane/src/proxy/request_utils.rs`
- Modify: `services/data-plane/src/proxy/entry.rs`
- Modify: `services/data-plane/src/proxy/ws_utils.rs` (only if needed for shared helper extraction)

**Step 1: Make request adaptation continuation-aware**

- Preserve the default `store` omission semantics for non-compact Codex-profile `/v1/responses`.
- Keep preserving any explicit caller-provided `store` value.
- Preserve all existing non-continuation rewrite rules besides the removed default `store=false` injection.

**Step 2: Add shared stale-anchor rewrite helper**

- Introduce a helper that can remove stale `previous_response_id` from HTTP JSON bodies, analogous to the existing websocket retry rewrite.
- Keep the rewrite minimal: remove only the stale continuation anchor.

**Step 3: Teach the HTTP bridge to retry same-account on `previous_response_not_found`**

- When the upstream Codex HTTP response maps to `previous_response_not_found`:
  - retry on the same account
  - reuse the already selected account and body adaptation
  - rewrite the body to drop the stale `previous_response_id`
  - do not trigger cross-account failover first

**Step 4: Apply the same semantics to compact**

- Reuse the same stale-anchor rewrite for `/v1/responses/compact`.
- Keep compact-specific route mapping intact.

**Step 5: Re-run targeted tests and verify GREEN**

Run: `cargo test -p data-plane compatibility -- --nocapture`

Expected: new HTTP/compact continuation tests pass.

### Task 5: Update compatibility matrix with verified support levels

**Files:**
- Modify: `docs/responses-api-compatibility-matrix.md`

**Step 1: Fill the matrix using test evidence**

- Mark:
  - basic text
  - streaming
  - function calling
  - structured output
  - `previous_response_id`
  - compact
  - websocket continuation

**Step 2: Add Codex rewrite notes**

- Document the exact rewrite rules that still apply.
- Explicitly call out that `/v1/responses` no longer injects `store=false` by default, while compact still has more conservative `store` handling.

### Task 6: Run full verification and summarize results

**Files:**
- Modify if needed: `README.md`

**Step 1: Run focused Rust test suites**

Run:
- `cargo test -p data-plane compatibility -- --nocapture`
- `cargo test -p data-plane compatibility_ws -- --nocapture`

**Step 2: Run broader build verification**

Run:
- `cargo check -p data-plane`
- `cargo check -p control-plane`

**Step 3: Re-run a minimal SDK smoke test if needed**

- Optionally reuse the `/tmp` OpenAI SDK smoke path against the live Personal instance to confirm `previous_response_id` now works.

**Step 4: Update progress checklist**

- Mark completed tasks in this plan.

**Step 5: Commit in atomic batches**

Suggested split:

1. Docs:
```bash
git add docs/responses-api-compatibility-matrix.md docs/plans/2026-03-24-responses-api-compat-design.md docs/plans/2026-03-24-responses-api-compat.md README.md
git commit -m "docs(repo): add responses api compatibility matrix" -m "Document Codex profile support levels and continuation behavior for Responses API."
```

2. Code + tests:
```bash
git add services/data-plane/src/proxy/request_utils.rs services/data-plane/src/proxy/entry.rs services/data-plane/src/proxy/ws_utils.rs services/data-plane/tests/compatibility.rs services/data-plane/tests/compatibility_ws.rs
git commit -m "fix(data-plane): harden responses continuation compatibility" -m "Recover stale previous_response_id requests without regressing the Codex proxy mainline."
```
