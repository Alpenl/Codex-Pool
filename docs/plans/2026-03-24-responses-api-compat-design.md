# Responses API Compatibility Matrix and Continuation Hardening Design

## 背景

当前项目已经对外暴露标准的 OpenAI `Responses API` 入口：

- `POST /v1/responses`
- `GET /v1/responses`（WebSocket）
- `POST /v1/responses/compact`

当上游账号属于 `ChatGptSession` / `CodexOauth` 且上游基路径是 `.../backend-api/codex` 时，data-plane 会进入 Codex 兼容层，把下游 `Responses API` 请求整理后转发到：

- `/backend-api/codex/responses`
- `/backend-api/codex/responses/compact`

这条兼容链路当前已经可以覆盖：

- 普通非流式 `responses.create`
- 流式 `responses.stream`
- function calling
- structured output / JSON schema

但真实联调暴露出一个关键缺口：`previous_response_id` 在 HTTP `Responses` 调用上不可靠，实际表现为续链请求返回 `upstream_request_failed`。与此同时，WebSocket 侧已经具备 `previous_response_not_found -> 去掉 stale id -> 同账号重试` 的恢复逻辑，HTTP 侧与 compact 侧还没有形成统一 continuation 语义。

## 目标

本次改造目标有两个：

1. 在仓库内提供一份清晰、可持续维护的 `Responses API` 兼容矩阵，明确哪些能力是：
   - 原生支持
   - 经 Codex 兼容改写后支持
   - 有条件支持
   - 已知限制 / 暂不支持
2. 在不回归现有 Codex 主链的前提下，补齐 continuation 兼容缺口，让 `previous_response_id` 在 HTTP / WS / compact 三条 `Responses` 入口上具备一致的语义与最小恢复策略。

## 现状与问题分析

### 1. 当前兼容层的既有行为

对 Codex profile，HTTP `/v1/responses` 当前会做如下改写：

- 自动补 `instructions=""`
- 将字符串 `input` 归一化成消息数组
- 非 `compact` 请求历史上曾强制 `store=false`
- 非流式下游请求改写成上游 `stream=true`
- 删除 `max_output_tokens`
- 归一化 `service_tier`

其中最关键的一条曾经是：**非 compact Responses 请求默认被改写成 `store=false`**。本次修补会移除这层默认注入，让标准 SDK 的多轮续链不再被代理先天破坏。

### 2. 与官方 `Responses API` 语义的张力

按官方文档，`previous_response_id` 是多轮续链锚点；它用于“基于前一次 response 继续对话”。同时，官方文档还明确区分了有状态和无状态场景：当 `store=false` 时，Responses API 更接近无状态调用，需要依赖额外上下文来延续推理或会话。

这意味着过去“默认 `store=false`”的 Codex 改写虽然适合单轮桥接，却天然不利于 `previous_response_id`。

### 3. 真正的兼容缺口

缺口不是“项目不会识别 `previous_response_id`”，因为：

- HTTP 路由已经把 `previous_response_id` 作为 continuation / sticky hint
- WebSocket 路由也把它作为 continuation 锚点
- WebSocket 出现 `previous_response_not_found` 时已经会去掉 stale id 并同账号重试

真正的问题是：

- HTTP `/v1/responses` 没有 continuation-aware 的恢复策略
- 历史上的 HTTP `/v1/responses` 默认 `store=false`，不利于后续 `previous_response_id`
- `compact` 与普通 `responses` 的续链语义没有统一文档化，容易让外部调用方误判

## 方案对比

### 方案 A：只补文档，不改代码

- 新增兼容矩阵文档
- 在 README / 文档中标注 `previous_response_id` 为已知限制

优点：

- 风险最小
- 不会影响现有代理行为

缺点：

- 关键缺口仍在
- 外部 SDK 的多轮 Responses 仍然不可靠

### 方案 B：最小修补 HTTP `previous_response_id`

- 仅在 HTTP `/v1/responses` 上，为带 `previous_response_id` 的请求保留 continuation 语义
- 复用 WebSocket 已有的 `previous_response_not_found` 恢复策略

优点：

- 改动集中
- 能解决最明显的联调故障

缺点：

- `compact` 与 WS 语义文档仍可能散落
- 兼容矩阵不完整

### 方案 C：推荐方案，统一 continuation hardening

- 保留当前 Codex 主链的既有成功路径
- 新增仓库内兼容矩阵文档，系统化描述支持范围
- 将 continuation 语义统一到 HTTP / WS / compact：
  - 把 `previous_response_id` 视为一等 continuation 锚点
  - 针对 `previous_response_not_found` 采用最小恢复策略
  - 保留 `store` 的省略语义，让标准 SDK 的第一轮 Responses 不再被强行降级为无状态调用
- 用回归测试锁住“不回归现有 Codex 主链”这一约束

优点：

- 解决当前最痛缺口
- 把行为说明和代码实现同步收口
- 不需要重做整个 Codex 兼容层

缺点：

- 需要补一批 HTTP / WS / compact 回归测试
- 需要更谨慎处理 `store` 改写规则

## 选择

采用 **方案 C**。

原因是：用户明确要求“补最关键兼容缺口”，同时又要求“不能让 Codex 格式主链出现任何回归”。这要求我们既不能只写文档，也不能大拆现有 Codex 兼容层，而应该在 continuation 相关字段和恢复路径上做统一 hardening。

## 设计决策

### 1. 兼容矩阵单独落文档

新增一份面向仓库维护者的文档，至少覆盖：

- 入口路径：`/v1/responses`、`/v1/responses/compact`、WS `/v1/responses`
- 能力维度：basic text、stream、function calling、structured output、previous_response_id、compact、WS continuation
- 支持等级：`supported` / `adapted` / `conditional` / `known-gap`
- Codex profile 下的特殊改写规则

矩阵的目标不是宣传，而是给后续联调、测试和回归检查提供统一依据。

### 2. `previous_response_id` 作为一等 continuation 锚点

HTTP / WS / compact 三条链路统一遵守：

- `previous_response_id` 优先作为 continuation 锚点
- 若上游返回 `previous_response_not_found`，说明 continuation anchor 已失效
- 对这类错误采用“最小恢复”：
  - 同账号重试
  - 去掉 stale `previous_response_id`
  - 保留其余输入与会话粘性信息

这样可以与现有 WS 行为保持一致，而不是让 HTTP 路径单独退化成“直接失败”。

### 3. `store` 改写规则改为 preservation-first

这是本次最关键的语义修正：

- 普通 `/v1/responses` 请求，不再默认插入 `store=false`
- 若调用方显式设置 `store`，则尊重调用方
- `previous_response_id` 请求会原样保留 continuation 锚点，不再因为代理默认改写而丢失上游续链能力

这样做的意图是：

- 不回归普通 Codex 主链的路径改写、桥接和字段规范化
- 同时不给标准 SDK 的续链能力制造结构性阻碍

### 4. `compact` 路径语义与普通 Responses 对齐

`compact` 仍保持自己当前的 stream/store 改写规则，但 continuation 语义要统一：

- 允许解析和保留 `previous_response_id`
- 遇到 `previous_response_not_found` 时采用同样的最小恢复
- 如果 compact 上游实际不支持某些续链能力，文档里明确标注为 `conditional` 或 `known-gap`

### 5. 不改变现有 Codex 主链的非 continuation 改写

本次不打算修改以下既有成功路径：

- `instructions` 自动补齐
- `input` 归一化
- `service_tier` 归一化
- 非流式桥接到上游 SSE 再还原 JSON
- `max_output_tokens` 删除

这些行为已经有现有回归测试保护，且是当前项目的主要调用链，不应在这次修补里被顺手重构。

## 测试策略

### HTTP

- 新增失败测试：Codex profile 下，`previous_response_id` 的 HTTP `/v1/responses` 调用先收到 `previous_response_not_found`，随后同账号重试成功。
- 新增无回归测试：普通单轮 `/v1/responses` 仍保持原有 path/input/instructions/stream 改写，不出现其他字段层面的回归。
- 新增两轮续链测试：标准 SDK 风格的第一轮省略 `store`，第二轮 `previous_response_id` 能直接续上，不依赖 stale-anchor 重试兜底。

### WebSocket

- 保持现有 `previous_response_not_found` 恢复测试继续通过。
- 新增/整理文档说明，确认 WS 已有行为被纳入兼容矩阵。

### compact

- 新增失败测试：`/v1/responses/compact` 在 continuation 场景下的转发与恢复行为。
- 若上游行为无法完全支持，确保对外错误契约稳定，且文档标记为已知限制。

## 风险与控制

### 风险 1：误伤普通单轮 Codex 请求

控制：

- 只调整 `store` 默认注入，不碰其他成功路径改写
- 用现有 compatibility 测试确保主链不回归

### 风险 2：HTTP 与 WS 对 `previous_response_not_found` 的恢复行为不一致

控制：

- 复用 WS 已有的“去 stale id 再重试”语义
- 在兼容矩阵中明确说明三条入口的 continuation 策略

### 风险 3：compact 语义被过度承诺

控制：

- 文档中将 `compact` 单独列为独立能力维度
- 只在测试证据支持的范围内标记为 `supported/adapted`

## 验收标准

- 仓库内新增 `Responses API` 兼容矩阵文档，覆盖 HTTP / WS / compact 和主要能力维度。
- `previous_response_id` 的 HTTP Responses 调用在 Codex profile 下通过回归测试。
- 现有普通 Codex `/v1/responses` 主链兼容测试继续通过，不出现字段改写回归。
- 若 `compact` 续链存在限制，文档中明确标注，并有稳定错误契约或回退行为。
