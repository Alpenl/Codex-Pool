# 统一 OAuth 准入池设计

## 背景

当前三层产品在 OAuth 导入与上线链路上存在同一个结构性问题：`vault` 只能表达“已入库”，不能表达“适合上线”。结果就是：

- `personal/sqlite` 导入虽然已经走 `queue_oauth_refresh_token()`，但激活时仍会直接 `refresh RT`
- `team/business/postgres` 在入 vault 前还会先 `validate RT`，导入阶段就触达上游
- 上线成功后还可能再做一轮 `prefill rate limits`
- admin 侧只能从 `Accounts` 看已物化的在线账号，无法看库存里的准入状态

这会让“导入成功”和“适合上线”混在一起，导致 RT 触达次数偏高，也让库存治理、补池和故障判读缺少稳定语义。

## 目标

为 `personal / team / business` 三层产品统一引入一套 `vault admission` 模型，明确区分：

1. 导入完成：记录已安全进入 `vault`
2. 准入完成：记录已具备进入在线池的条件
3. 在线运行：账号已进入 `active / quarantine / pending_purge`

统一后的第一优先级是**减少导入期与补池期对 RT 的触达次数**，尤其避免“导入即 refresh”与“导入即 validate RT”。

## 非目标

- 本轮不重做整体两层半结构；`vault + online pool` 架构保持不变
- 本轮不把 `ready` 等状态塞进 `AccountPoolState`
- 本轮不提供 admin 手动 promote / reprobe / bulk mutate
- 本轮不新建独立 sidecar 服务，仍复用现有 `control-plane` 循环与存储层

## 总体方案

### 1. 保持在线池状态机不变

`AccountPoolState` 继续只描述已经物化到 `upstream_accounts` 的在线账号：

- `active`
- `quarantine`
- `pending_purge`

这套状态只服务 runtime 路由与健康恢复，不承载库存准入语义。

### 2. 将 vault 扩展为准入状态机

统一把 vault 状态扩展为：

- `queued`
- `ready`
- `needs_refresh`
- `no_quota`
- `failed`

语义定义：

- `queued`：已导入，尚未完成 admission
- `ready`：已用 AK 探测通过，当前有额度，且可确定 AK 过期时间，可直接无 refresh 进入 active
- `needs_refresh`：当前不能仅凭 AK 直接上线，需要一次 RT refresh 才能进入 active
- `no_quota`：AK 探测成功，但当前无可用额度，暂不进入 active
- `failed`：输入非法、密钥损坏或其它明确 fatal 场景，不再自动重试

### 3. 导入链路改为“纯入库，不触达 RT”

所有 edition 的导入链路统一改为：

1. 解析 payload
2. 去重并写入 vault
3. 若存在 fallback AK，则触发一次 AK admission probe
4. 不在 import queue 阶段调用 `validate RT`
5. 不在 import queue 阶段调用 `refresh RT`

这意味着：

- `sqlite` 不再把 `queued` 当成“待 refresh 的冷库”
- `postgres` 必须去掉导入期 `validate_oauth_refresh_token_inner()` 的 live RT 触达
- canonical identity merge 需要从导入前移到 admission/activation 成功后

### 4. admission worker 独立负责准入判定

新增统一的 admission worker，负责：

- 消费 `queued`
- 到期重试 `no_quota`
- 用 fallback AK 执行 `fetch_rate_limits`
- 把记录推进到 `ready / no_quota / needs_refresh / failed`

准入判定规则：

- `AK 探测成功 + 有额度 + expiry 可确定` -> `ready`
- `AK 探测成功 + 无额度` -> `no_quota`
- `AK 探测成功 + expiry 不可确定` -> `needs_refresh`，reason=`expiry_unknown`
- `AK 鉴权失败 / token 不可直接上线` -> `needs_refresh`
- `输入非法 / 密钥损坏 / 明确 fatal` -> `failed`

### 5. activation loop 改为“ready 优先，needs_refresh 兜底”

在线池补水时：

1. 先消费 `ready`
2. 不足时再消费 `needs_refresh`

两条路径分别定义为：

- `ready -> active`：禁止 refresh，直接从 fallback token 建 `OAuthCredentialRecord`
- `needs_refresh -> active`：执行一次且仅一次 `refresh + rate_limits` 原子准入

### 6. Accounts 与 Inventory 分层展示

- `Accounts` 继续代表在线池，只展示 `upstream_accounts`
- 新增 `Inventory` 页面专门展示 vault/admission 记录
- `ImportJobs` 增补 admission outcome
- `Dashboard` 增补统一的库存/在线池总览

## 数据模型

### 1. vault 记录新增字段

在现有 vault 记录上统一增加：

- `admission_source`
- `admission_checked_at`
- `admission_retry_after`
- `admission_error_code`
- `admission_error_message`
- `admission_rate_limits_json`
- `admission_rate_limits_expires_at`

这些字段只服务准入与监控，不直接参与 runtime 路由。

### 2. expiry 判定来源

`ready` 必须具备可确定的 AK 过期时间，来源优先级固定为：

1. `fallback_token_expires_at`
2. access token JWT `exp`
3. 无法判定则不得进入 `ready`

即使 probe 成功，只要 expiry 不明，也必须落到 `needs_refresh`。

### 3. ready -> active 的凭证写入

新增一条“从 fallback token 直接建 OAuthCredentialRecord”的路径，字段语义：

- `refresh_token_enc`：保留原 RT
- `access_token_enc`：写 admission 成功的 fallback AK
- `token_expires_at`：取已确认 AK expiry
- `last_refresh_status = never`
- `last_refresh_at = null`
- `token_version = 0`
- `token_family_id`：基于 `refresh_token_sha256` 的稳定派生值

这样同一 RT 家族在未 refresh 前仍能被归组，不必等待第一次 refresh 才建立 family 关系。

## 调度与恢复

### 1. no_quota

`no_quota` 不进入 active。

`admission_retry_after` 的来源：

- 优先使用 rate limit reset 时间
- 拿不到 reset 时，回退到现有 quota/rate-limit backoff 语义

到期后由 admission worker 重新使用 AK 探测；若 AK 已失效，则转为 `needs_refresh`。

### 2. quarantine 与 pending_purge

运行态继续沿用当前语义：

- `rate_limited / quota_exhausted / auth_expired` 可进入 `quarantine`
- `account_deactivated / refresh_token_revoked / refresh_token_reused / invalid_refresh_token` 进入 `pending_purge` 或 family 级失效

准入态不替代运行态，它们只解决“是否值得上线”，不解决“上线后是否继续健康”。

## API 与前端

### 1. Accounts

Accounts 继续只列在线池账号，但要补齐前端类型与展示：

- `pool_state`
- `quarantine_until`
- `quarantine_reason`
- `pending_purge_at`
- `pending_purge_reason`
- `has_refresh_credential`
- `has_access_token_fallback`
- `refresh_credential_state`

详情弹窗新增 `Runtime Health` 区块，用于解释当前在线状态。

### 2. Inventory

新增只读 admin API：

- `GET /upstream-accounts/oauth/inventory/summary`
- `GET /upstream-accounts/oauth/inventory/records`

新增 Inventory 页面，固定展示：

- `label`
- `email`
- `chatgpt_account_id`
- `plan`
- `source_type`
- `vault_status`
- `admission_checked_at`
- `admission_retry_after`
- `quota` 摘要
- `has_rt`
- `has_ak`
- `admission_reason`

### 3. ImportJobs

保留原有 `created / updated / failed / skipped` 语义，不重定义“导入是否成功”。

新增：

- `admission_counts`
- item 级 `admission_status`
- `admission_source`
- `admission_reason`

这样“已导入但无额度”不会被误算成失败。

### 4. Dashboard

新增池子总览卡片：

- `vault queued`
- `vault ready`
- `vault needs_refresh`
- `vault no_quota`
- `active`
- `quarantine`
- `pending_purge`

近 1h 趋势作为 phase 2，可在本轮预留字段，不强制首版交付。

## Edition 影响

本方案是统一方案，不是 `personal` 特例。

- `personal/sqlite`：在当前 in-memory/sqlite vault 基础上补 admission 状态机与只读监控
- `team/business/postgres`：去掉导入期 RT validate，统一改成纯入库 + admission worker

统一后各层差异只体现在：

- 存储实现不同
- 默认池子目标与并发配置不同
- 管理面 capability gating 不同

核心状态机与准入语义保持一致。

## 风险与取舍

- Postgres 现有 canonical identity merge 有一部分依赖导入期 live validate，统一方案需要把它后移到 admission/activation 成功之后
- `ready` 严格要求 expiry 可判定，会让少量 AK 探测成功但无 expiry 的记录退回 `needs_refresh`
- admission probe 与 runtime rate-limit cache 会暂时存在两份语义相近的数据，但这是有意的：前者服务库存准入，后者服务运行态路由

这几个取舍都优于“导入阶段高频 RT 触达”。

## 验收标准

- 导入 `RT + AK + 可解析 expiry + 有额度` 时，记录进入 `ready`，导入路径 refresh 调用次数为 0
- 导入 `RT + AK + 零额度` 时，记录进入 `no_quota`，并写入 `admission_retry_after`
- 导入 `RT + AK + probe 成功但无 expiry` 时，记录进入 `needs_refresh`，reason=`expiry_unknown`
- active pool 补水时，`ready` 必须先于 `needs_refresh` 被消费
- `ready -> active` 不触发 refresh
- `needs_refresh -> active` 最多只触发一次 refresh
- import job summary/item 正确返回 admission 统计，不破坏现有上传流程
- Accounts 只看在线池，Inventory 正确展示 vault 准入态，Dashboard 总览与后端 summary 一致
