# 账号池信号热图成功/失败计数扩展设计

## 背景

当前账号池“最近信号”热图 bucket 只返回：

- `signal_count`
- `intensity`
- `active_count`
- `passive_count`

这只能表达某个时间桶里“有多少活动”，不能表达这些活动里“多少成功、多少失败”。前端需要在列表与详情热图里用红/绿语义区分成功和失败，因此后端需要扩展热图读模型。

## 目标

- 为账号池热图 bucket 增加成功/失败计数字段：
  - `success_count`
  - `error_count`
- 保持现有字段不变，保证现有前端兼容。
- 同时扩展 summary 读模型，避免列表热图只能看到 detail 才能使用新数据。

## 非目标

- 不修改 data-plane 或 control-plane 事件写入协议。
- 不新增数据库表或迁移。
- 不修改 `intensity` 的定义；它继续仅基于 `signal_count`。

## 事实来源

底层 `system_event_logs` 已经持久化了：

- `category`
- `event_type`
- `severity`
- `status_code`
- `account_id`
- `selected_account_id`

其中 request log 转系统事件时已经区分：

- `request_completed`
- `request_failed`

并携带 `status_code`。

## 成功/失败判定规则

### Request 类事件

- 若 `event_type == "request_failed"`，计入 `error_count`
- 否则若 `status_code >= 400`，计入 `error_count`
- 其他情况计入 `success_count`

### Patrol / AccountPool 类事件

- 若 `severity` 为 `Warn` 或 `Error`，计入 `error_count`
- 若 `severity` 为 `Info`，计入 `success_count`

### 汇总不变量

对每个 bucket：

- `signal_count = success_count + error_count`

同时保留现有：

- `active_count`
- `passive_count`

它们与 `success/error` 是两个正交维度。

## 契约变更

### `AccountSignalHeatmapBucket`

新增：

- `success_count: u32`
- `error_count: u32`

### `AccountSignalHeatmapSummary`

新增：

- `success_counts: Vec<u32>`
- `error_counts: Vec<u32>`

保留现有 `intensity_levels`，供旧前端继续使用。

## 实现位置

- `services/control-plane/src/contracts.rs`
  - 扩展 summary / bucket 契约
- `services/control-plane/src/system_events.rs`
  - 扩展 `AccountSignalEventRow`
  - 查询 `event_type` / `severity` / `status_code`
  - 更新 bucket 聚合逻辑
  - 更新 summary 生成逻辑
- `services/control-plane/src/app/core_handlers/account_access.rs`
  - 仅透传新契约，无需额外业务逻辑

## 测试

补充与更新 `services/control-plane/src/system_events.rs` 中的热图测试：

- request 成功与失败混合进入同一个 bucket
- patrol/account_pool 使用 `severity` 进行成功/失败聚合
- summary 的 `success_counts` / `error_counts` 长度与 bucket 对齐

## 风险与兼容性

- 这是只增不减的 JSON 契约扩展，旧前端可继续消费旧字段。
- 需要保证 request 类事件不会被重复计入 success 与 error。
- 需要同时处理 `account_id` 与 `selected_account_id` 匹配逻辑，保持与现有热图归属方式一致。
