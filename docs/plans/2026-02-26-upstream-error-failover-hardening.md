# 上游错误拦截与故障切换加固 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复「上游原始报错透传、额度耗尽账号反复被轮询、重试切号预算提前耗尽、WS/SSE 场景未正确切号」问题，确保客户端看到统一错误语义且尽量成功切到可用账号。

**Architecture:** 在 data-plane 增加统一错误分类层（status + body + header），驱动更精细的 failover 与 ejection 策略；对已知账号状态错误执行恢复动作（刷新/禁用/长时间隔离）；对流式与 WS 增加前置错误探测与早切号路径。保留原始上游详情到日志，不再直接透传给终端用户。

**Tech Stack:** Rust, axum, reqwest, tokio, wiremock tests

---

### Task 1: 建立统一上游错误分类模型

**Files:**
- Modify: `services/data-plane/src/proxy/entry.rs`
- Modify: `services/data-plane/src/proxy/request_utils.rs`
- Test: `services/data-plane/src/proxy/ws_utils.rs`（现有 proxy tests）

**Step 1: 写失败测试（错误码分类）**
- 新增/扩展测试覆盖以下输入：
  - `401 + token_invalidated`
  - `403 + access token could not be refreshed`
  - `429 + rate_limited`
  - `429 + you've hit your usage limit`
  - `503 + server_is_overloaded`
- 断言输出为统一 `ErrorClass`（例如 `AuthExpired`、`QuotaExhausted`、`RateLimited`、`Overloaded`、`Transient5xx`）。

**Step 2: 实现最小分类器**
- 在 `request_utils.rs` 增加 `UpstreamErrorContext` 与 `ErrorClass`。
- 统一从 body/header/status 提取：
  - `upstream_error_code`
  - `retry_after`
  - `quota_reset_hint`（可从 message 中提取时间字符串，解析失败则为空）

**Step 3: 运行单测**
- 运行 proxy 相关测试，确认分类单测先红后绿。

**Step 4: Commit**
- `feat(data-plane): add upstream error classification model`

---

### Task 2: 统一客户端错误响应，停止透传上游原文

**Files:**
- Modify: `services/data-plane/src/proxy/request_utils.rs`
- Modify: `services/data-plane/src/proxy/ws_utils.rs`
- Test: `services/data-plane/tests/compatibility.rs`

**Step 1: 写失败测试（响应改写）**
- 对 `401/403/429/5xx` 增加断言：返回体为 `ErrorEnvelope`（内部 code + message），不含上游原文敏感文本。
- 保留兼容：`2xx` 仍透传正常业务响应。

**Step 2: 实现响应改写**
- 改造 `buffered_response`：
  - 对 `status >= 400` 不再 `response_with_bytes` 原样回传。
  - 根据 `ErrorClass` 返回 `json_error(...)`（如 `token_invalidated`、`quota_exhausted`、`retry_later`、`upstream_request_failed`）。
- 上游原文仅写日志字段，不返回客户端。

**Step 3: 回归验证**
- 跑 `compatibility.rs` 相关 case，确保接口行为一致且错误文案已统一。

**Step 4: Commit**
- `feat(data-plane): normalize upstream error payloads for clients`

---

### Task 3: 额度不足/登录失效账号的隔离策略

**Files:**
- Modify: `services/data-plane/src/proxy/request_utils.rs`
- Modify: `services/data-plane/src/config.rs`
- Modify: `config.example.toml`
- Test: `services/data-plane/tests/compatibility.rs`

**Step 1: 写失败测试（TTL 策略）**
- case:
  - `QuotaExhausted` -> 长 TTL（例如 30 分钟）
  - `AuthExpired` -> 中长 TTL（例如 10-30 分钟）并尝试 refresh
  - `RateLimited` -> 优先 `Retry-After`，否则 base TTL
- 断言账号被 `mark_unhealthy` 并在该窗口不再被 pick。

**Step 2: 实现 TTL 策略**
- 扩展 `ejection_ttl_for_response`：
  - 依据 `ErrorClass` 计算 TTL（支持 `Retry-After`）。
- 新增可配置项（含默认值）：
  - `quota_exhausted_ejection_ttl_sec`
  - `auth_expired_ejection_ttl_sec`
  - `rate_limited_min_ejection_ttl_sec`

**Step 3: 回归**
- 跑已有 `ejects_account_after_429_response`，并补充 `usage_limit` 专项测试。

**Step 4: Commit**
- `feat(data-plane): add long-lived ejection policy for quota/auth failures`

---

### Task 4: 改造 failover 决策，避免“号池未死完但提前失败”

**Files:**
- Modify: `services/data-plane/src/proxy/entry.rs`
- Modify: `services/data-plane/src/config.rs`
- Modify: `config.example.toml`
- Test: `services/data-plane/tests/compatibility.rs`

**Step 1: 写失败测试（预算与尝试次数）**
- 构造 3 个账号：前 2 个失败，第 3 个成功。
- 断言在预算内至少尝试到第 3 个账号，不会因为过短轮询/等待逻辑提前 return failure。

**Step 2: 实现最小改造**
- 在 `proxy_handler` 增加“最少跨账号尝试次数”约束：
  - 即使 `request_failover_wait` 接近耗尽，也优先保证尝试 `N` 个不同账号（若可用）。
- 新增配置：
  - `failover_min_distinct_accounts`（默认 2）

**Step 3: 验证**
- 跑 failover 相关兼容测试，确认成功率提升且无死循环。

**Step 4: Commit**
- `feat(data-plane): enforce minimum distinct-account failover attempts`

---

### Task 5: SSE/WS 早期错误探测与切号

**Files:**
- Modify: `services/data-plane/src/proxy/billing_stream.rs`
- Modify: `services/data-plane/src/proxy/entry.rs`
- Test: `services/data-plane/tests/compatibility.rs`

**Step 1: 写失败测试（流式首段报错）**
- 模拟 SSE 首个 chunk 返回错误事件（含 `usage_limit`/`token_invalidated`）。
- 断言当前账号被隔离并触发 cross-account failover。

**Step 2: 实现 SSE 早探测**
- 在 `stream_response_with_first_chunk` 前/首 chunk 阶段解析错误事件：
  - 命中账号态错误即不进入纯透传，转入 failover 分支。

**Step 3: WS 改造（第一阶段）**
- 对 WS 先做连接前健康筛选（已存在）+连接失败快速切号（已存在）补齐日志与错误分类。
- 增加“可选预热探测”开关（仅对可探测 path），避免直接把账号态错误交给客户端 reconnect 循环。

**Step 4: 验证**
- 跑 WS/SSE 兼容测试，确保不会把明显账号失效文案直接展示给终端。

**Step 5: Commit**
- `feat(data-plane): add stream/ws early account-error detection`

---

### Task 6: 恢复动作增强（refresh/disable）与错误码扩展

**Files:**
- Modify: `services/data-plane/src/proxy/request_utils.rs`
- Modify: `services/control-plane/src/app/tail_handlers/policies_snapshot.rs`（如需补内部动作）
- Test: `services/data-plane/tests/compatibility.rs`

**Step 1: 写失败测试（错误码映射）**
- 把以下 code/message 映射到恢复动作：
  - `token_invalidated` -> rotate refresh token
  - `account_deactivated` -> disable account
  - `refresh_token_reused`/`refresh_token_revoked` -> disable family or account
  - `usage_limit` -> no recovery action, long ejection

**Step 2: 实现映射扩展**
- 扩展 `recovery_action_for_upstream_error_code` 及 message fallback 规则。
- 确保恢复失败不阻塞切号（异步执行保持现有行为）。

**Step 3: 验证**
- 跑 `token_invalidated_should_failover_without_waiting_internal_refresh_completion` 与新增 case。

**Step 4: Commit**
- `feat(data-plane): extend recovery actions for upstream account-state errors`

---

### Task 7: 可观测性与运营开关

**Files:**
- Modify: `services/data-plane/src/app/internal_metrics.rs`
- Modify: `services/data-plane/src/proxy/request_utils.rs`
- Modify: `services/data-plane/src/proxy/entry.rs`
- Modify: `config.example.toml`

**Step 1: 增加指标**
- 新增 metrics：
  - `proxy_error_class_total{class}`
  - `proxy_ejection_total{reason}`
  - `proxy_failover_attempts_per_request`
  - `proxy_failover_return_failure_total{reason}`

**Step 2: 增加开关**
- `enable_upstream_error_normalization`（默认 true）
- `enable_stream_error_precheck`（默认 true）

**Step 3: 回归**
- 跑 internal metrics 测试，确保指标输出完整。

**Step 4: Commit**
- `feat(data-plane): add failover/error-class observability and feature flags`

---

### Task 8: 全量回归与灰度发布

**Files:**
- Modify: `docs/plans/2026-02-26-upstream-error-failover-hardening.md`（记录结果）
- Optional: `README.md`（运维建议）

**Step 1: 测试清单**
- `cargo test -p data-plane`
- `cargo test -p control-plane`
- 重点观察：
  - `services/data-plane/tests/compatibility.rs`
  - `services/data-plane/tests/stream_consistency.rs`
  - `services/data-plane/tests/e2e_proxy_snapshot.rs`

**Step 2: 灰度发布策略**
- 第 1 阶段：仅开错误归一化，不改 TTL。
- 第 2 阶段：开启 `quota/auth` 长隔离。
- 第 3 阶段：开启 SSE/WS 早探测。
- 每阶段观察 24h：
  - 成功率
  - failover_exhausted_total
  - no_upstream_account 占比
  - 客户端“上游原文报错”出现率

**Step 3: 回滚策略**
- 所有新行为均由配置开关控制，可单独回滚。
- 回滚优先级：WS/SSE 早探测 > 长隔离 > 错误归一化。

**Step 4: Commit**
- `docs: add rollout and verification checklist for failover hardening`

---

## 关键验收标准（DoD）

1. 客户端不再直接看到上游“账号态原文报错”（如 token refresh 失败原文、usage limit 原文）。
2. `usage_limit` 账号在配置窗口内不再被轮询命中。
3. 号池存在可用账号时，请求不会因预算过早返回失败。
4. `token_invalidated` 等账号态错误可自动触发恢复动作或隔离动作。
5. SSE/WS 场景显著降低“Reconnecting 后仍持续命中坏号”的概率。

