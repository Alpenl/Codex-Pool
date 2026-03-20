# Platform Core / Edition Architecture Refactor Implementation Plan

> **For Codex:** 本计划改为由当前会话的主 agent 直接按顺序实施，不再依赖额外 subagents、worker 分支或 integration worktree。所有跨模块集成、验证和计划回填都在当前工作区串行完成。

**Goal:** 把 `personal / team / business` 从“同一坨代码里的运行时裁剪”重构成“共享领域骨架 + 显式 capability matrix + backend family 装配”，同时保持 `personal/team` 的单部署体验、现有升级路径和运行时契约不变。

**Architecture:** 以现有 `codex-pool-core` 为唯一平台 core，收口 edition/capability/error/snapshot/runtime contracts；`control-plane` 与 `data-plane` 各自保留自己的 backend adapters 与组合根；Cargo feature 只表达 backend family，不表达 edition；edition 只负责 capability 和装配，不再负责隐藏依赖树。

**Tech Stack:** Rust workspace（Axum / Tokio / SQLx）、React + Vite、SQLite / PostgreSQL / Redis / ClickHouse、Cargo features、edition capability matrix。

---

## Summary

- 基线锚点：`main@efa878f`（`refactor: 调整依赖裁剪`）。
- 本计划替代两份旧计划的后续实施地位：
  - `.codex/docs/plans/20260313-001455-repo-personal-team-business-plan.md`
  - `.codex/docs/plans/2026-03-20-control-plane-backend-boundaries-plan.md`
- 这轮重构不是再造三套产品代码，而是把三层 edition 固化为：
  - 一套共享领域模型
  - 一套统一 capability matrix
  - 三套不同的 runtime/dependency assembly
- `personal` 和 `team` 继续保留轻量、单部署、低心智负担的外部产品体验。
- `business` 允许继续偏向模型统一和完整后端栈，但不能反向污染 `personal/team` 的依赖树。

## Frozen Decisions

以下决策已由产品 owner 明确，实施时不再重新讨论：

- 最不能接受的失败结果：edition 边界继续泄漏。
- capability 的唯一真相必须在 `codex-pool-core` 中统一维护，前后端和装配层都从这里推导。
- `personal` 在内部模型上是共享领域模型的单租户投影，不是另一套独立世界。
- `team` 在内部模型上是 `business` 的轻量投影，不是长期独立平行产品。
- `personal/team` 的单部署体验不能被破坏。
- `personal` 的长期资源目标是轻量 NAS 级，不能为了模型整齐引入重型常驻后台负担。
- `team` 的核心产品价值是轻依赖自托管，而不是尽量贴近 `business` 的基础设施形态。
- 三层版本是同一条升级路径，`edition-migrate`、导入导出、shrink、配置兼容都属于架构本身。
- 升级时优先保障“操作方式连续”，尤其是 `personal/team`；`business` 可以在内部结构上更偏模型统一。
- 开发期验证偏轻量，主分支和集成阶段再跑重验证；不允许把“全量跑很慢”当作长期默认开发体验。

## Baseline Facts On `main`

- `codex-pool-core` 当前仍混放了 edition/capability、错误信封、共享 DTO，以及大量 control-plane 专用 API DTO；它还不是真正的“平台 core”。
- `services/control-plane/src/main.rs` 仍是超重组合根，混合了：
  - edition 解析
  - runtime 默认值
  - store 选择
  - usage repo 选择
  - background loop 注册
  - `personal/team` single-binary merge
- `control-plane` 仍直接依赖：
  - `sqlx-postgres`
  - `redis`
  - `lettre`
  - `clickhouse`（feature gate）
- `services/control-plane/src/store/defs.rs` 仍让核心抽象暴露 `PgPool` 等 backend 细节。
- `services/control-plane/src/tenant/types_and_runtime.rs` 同时承载：
  - tenant session/JWT/cookie
  - self-service 注册/验证/找回密码
  - SMTP
  - credit/billing runtime
- `services/data-plane` 已经有 `redis-backend` feature、`EventSink`、`RoutingCache` 等较好的 adapter 边界，但 `bootstrap.rs` 仍是重组合根。
- `README.md` 与 `docs/editions-and-migration.md` 已对外承诺：
  - `codex-pool-personal / codex-pool-team / codex-pool-business`
  - `personal/team` 单机/单容器形态
  - `edition-migrate export / preflight / import / archive inspect / shrink`
  - `x-request-id`
  - `CONTROL_PLANE_INTERNAL_AUTH_TOKEN`
  - 三档 docker compose 矩阵

## Public Contracts That Must Not Regress

- 二进制名保持不变：
  - `codex-pool-personal`
  - `codex-pool-team`
  - `codex-pool-business`
- `CODEX_POOL_EDITION` 的优先级保持不变；环境变量优先于二进制名推断。
- `/api/v1/system/capabilities` 的对外契约保持不变。
- `frontend` 基于 capability 的 shell routing 和 route gating 语义保持不变。
- `edition-migrate` 的命令名与主参数保持不变。
- `personal/team` 的单部署体验保持不变：
  - 用户仍然可以一个产物/一个启动方式跑起来
  - 不引入 Redis / ClickHouse 作为基础必需项
- `x-request-id` 继续只是 tracing / correlation 字段，不变成 billing 幂等键。
- `CONTROL_PLANE_INTERNAL_AUTH_TOKEN` 继续是 control-plane / data-plane / usage-worker 的内部鉴权核心契约。
- `/health`、`/livez`、`/readyz`、日志流命名、request correlation 行为保持兼容。

## Execution Model

### Baseline Rule

- 本计划由我在当前工作区直接执行，不再新开实现 worktree，也不再拆给 subagents。
- 默认一次只推进一个主 workstream；如果相邻 workstream 强耦合，可以在同一阶段内连续完成，但仍按既定顺序收口。
- `Cargo.toml`、共享测试基建、公共 re-export、跨 crate import 与 feature gate 都由我自己在当前阶段直接整合，不再依赖后续 cherry-pick。
- 每完成一个阶段都要先回填计划中的完成记录和最小验证结果，再进入下一阶段。

### Sequential Execution Order

必须按以下顺序推进，不能跳过依赖顺序：

1. `core-foundation`
2. `data-plane-runtime`
3. `control-plane-store`
4. `control-plane-usage`
5. `control-plane-tenant-session`
6. `control-plane-billing`
7. `control-plane-entry`
8. `contracts-docs`

原因：

- `core-foundation` 提供 capability/contract 新基线。
- `data-plane-runtime` 与 `control-plane-store/usage` 对依赖树的裁剪最早产生正反馈。
- `tenant-session` 和 `billing` 都依赖新的 store/usage 边界。
- `control-plane-entry` 必须最后吃入前面所有装配变化。
- `contracts-docs` 需要在结构稳定后补最终护栏和文档。

### Ownership Rules

- 同一时刻只改一个主 workstream 的核心文件集；如果必须跨目录调整，以“为当前 workstream 解锁”为边界一次性收口，不把半成品留给后续阶段。
- `Cargo.toml`、共享测试基建、公共 re-export、跨 crate import 清理由我在当前阶段直接完成。
- 每个 workstream 完成后都要回填：
  - 变更摘要
  - 完整 changed files 列表
  - 已运行命令
  - 未解决风险
- 如需提交，提交必须保持原子，并遵循仓库提交规范。

### Validation Budget

这轮重构继续遵守“验证预算”而不是“每一步都全量跑”：

- `L0`：只读调研
  - 只允许代码阅读、契约盘点和计划更新
  - 禁止任何 `cargo check` / `cargo test` / `npm build`
- `L1`：当前 workstream 最小验证
  - 每个 workstream 在单次收尾前最多只运行 1 个 Rust 验证命令，且必须是最窄的那个
  - 允许的形式只有两类：
    - 一个精确测试目标
    - 一个精确 `cargo check`
  - 明确禁止：
    - `cargo test --workspace`
    - `cargo check --workspace`
    - 在同一 workstream 收尾时连续跑多 edition build matrix
    - 与当前写入范围无关的集成测试
- `L2`：阶段检查
  - 由我在完成一组强耦合 workstreams 后串行执行相关包级验证
  - 用于吸收跨 crate / 跨 manifest 的真实集成成本
- `L3`：最终验收矩阵
  - 只在阶段完成或最终验收时运行
  - 必须串行，避免与其他重编译任务叠加

实施约束：

- 如果当前 workstream 需要第二个 Rust 验证命令，先暂停并判断是否应把剩余验证推迟到 `L2` 阶段检查。
- `frontend` 相关验证默认只在 `contracts-docs` 阶段跑最小相关测试，不跑全量前端构建；全量 `frontend build` 留到 `L3`。
- 重编译成本最高的命令统一收归阶段检查与最终验收；平时优先验证“当前改动是否成立”。

## Target Architecture

### 1. `codex-pool-core`

最终只保留以下共享内容：

- edition/capability matrix
- 对外错误信封
- control-plane 与 data-plane 共用的 snapshot/event contracts
- 两边都用到的 shared domain model
- backend-neutral 的纯策略与 helper

最终不再保留：

- 纯 control-plane 管理后台 DTO
- tenant portal/self-service 专用 DTO
- logging/runtime 初始化这类 service-specific 代码

实施决策：

- 继续沿用现有 crate 名 `codex-pool-core`，不新建第二个 core crate。
- 通过拆模块净化，不通过复制 crate。

### 2. `control-plane`

最终形态：

- `main.rs` 只做：
  - 解析 runtime edition
  - 构建 runtime profile
  - 组装 backend adapters
  - 注册后台任务
  - 构造 Axum app
- store/usage/tenant/billing 通过更细的 ports 连接，不再让顶层装配直接依赖后端具体实现细节。
- `personal` 编译时只带 SQLite family。
- `team` 编译时只带 Postgres family。
- `business` 编译时才带 Redis / ClickHouse / SMTP family。

### 3. `data-plane`

最终形态：

- `bootstrap.rs` 只保留 runtime profile 到 adapter 的装配。
- `EventSink`、`RoutingCache`、`AliveRingRouter`、`SeenOkReporter` 的选择明确由 backend family 驱动。
- `personal/team` 不编译 Redis backend。
- `business` 编译 Redis backend，并保留现有可横向扩展能力。

### 4. Runtime / Packaging

最终形态：

- Cargo feature 只表达 backend family：
  - `sqlite-backend`
  - `postgres-backend`
  - `redis-backend`
  - `clickhouse-backend`
  - `smtp-backend`
- edition 不再映射成 Cargo feature 名。
- edition 只映射：
  - capability matrix
  - runtime defaults
  - backend assembly profile

## Workstream Details

### Workstream 1: Core Capability Foundation

**Files:**
- Modify: `crates/codex-pool-core/src/lib.rs`
- Modify: `crates/codex-pool-core/src/api.rs`
- Modify: `crates/codex-pool-core/src/model.rs`
- Modify: `crates/codex-pool-core/src/events.rs`
- Modify: `crates/codex-pool-core/src/logging.rs`
- Create: `crates/codex-pool-core/src/edition.rs`
- Create: `crates/codex-pool-core/src/error.rs`
- Create: `crates/codex-pool-core/src/snapshot.rs`
- Create: `crates/codex-pool-core/src/runtime_contract.rs`

**Deliverables:**
- 从超大的 `api.rs` 中拆出 `ProductEdition`、capability matrix、error envelope、snapshot/runtime contract。
- `api.rs` 只保留真正跨服务共享的 wire DTO；control-plane 专用 DTO 先打 `to_move` 注释分组并导出迁移清单。
- 提供稳定 helper：
  - `ProductEdition::from_env_value`
  - `ProductEdition::infer_from_binary_name`
  - `SystemCapabilitiesResponse::for_edition`
  - capability convenience helpers
- 为后续服务拆分提供最小 re-export，确保集成阶段可逐步迁移 imports。

**Verification:**
- `cargo test -p codex-pool-core`
- `cargo check -p control-plane --bin codex-pool-personal`
- `cargo check -p data-plane --no-default-features`

**Completion Notes:**
- 阶段进展（2026-03-20）：
  - 已新增 `edition.rs`、`error.rs`、`snapshot.rs`、`runtime_contract.rs`
  - 已新增 `ProductEdition::resolve_runtime_edition`，把 env 优先于二进制名的解析契约沉到 core
  - `codex-pool-core` 根模块已兼容 re-export edition/error/snapshot/runtime contract，便于后续服务逐步迁移导入路径
  - `api.rs` 已改为对上述核心契约做兼容 re-export，未直接改动 `services/**`
  - `api.rs` 中剩余 control-plane 专用 DTO 已按 `to_move` 分组标注：
    - `control-plane-admin`
    - `control-plane-routing`
    - `control-plane-usage`
    - `control-plane-import`
  - 已通过 `edition::tests::product_edition_infers_from_binary_name`
  - 已通过 `edition::tests::product_edition_resolves_env_before_binary_name`
  - 已通过 `tests::root_re_exports_core_contracts`
- 在计划回填中记录一份“已拆出模块 / 待迁出 DTO”清单。
- 不直接改 `services/**`。

### Workstream 2: Data-Plane Runtime And Adapter Boundaries

**Files:**
- Modify: `services/data-plane/Cargo.toml`
- Modify: `services/data-plane/src/app.rs`
- Modify: `services/data-plane/src/app/bootstrap.rs`
- Modify: `services/data-plane/src/config.rs`
- Modify: `services/data-plane/src/event.rs`
- Modify: `services/data-plane/src/event/http_sink.rs`
- Modify: `services/data-plane/src/event/redis_sink.rs`
- Modify: `services/data-plane/src/routing_cache.rs`
- Modify: `services/data-plane/src/upstream_health.rs`
- Modify: `services/data-plane/src/outbound_proxy_runtime.rs`
- Create: `services/data-plane/tests/dependency_boundaries.rs`

**Deliverables:**
- 固化 `redis-backend` 为唯一 Redis family feature。
- 新增 dependency boundary test：
  - `personal/team` build tree 不包含 `redis`
- 将 `bootstrap.rs` 中的 adapter 选择收口成显式 runtime profile helper。
- 保持 `EventSink` / `RoutingCache` trait 作为稳定边界，不把 Redis 选择逻辑散落在多个 call site。
- 保持 `personal/team` 走 control-plane HTTP sink 的语义不变。

**Verification:**
- `cargo test -p data-plane --test dependency_boundaries -- --nocapture`
- `cargo check -p data-plane --no-default-features`
- `cargo check -p data-plane --no-default-features --features redis-backend`
- `cargo test -p data-plane compatibility -- --nocapture`
- `cargo test -p data-plane compatibility_ws -- --nocapture`

**Completion Notes:**
- 阶段进展（2026-03-20）：
  - 已在 `bootstrap.rs` 新增 `RoutingCacheKind` 与 `select_routing_cache_kind(...)`
  - 已把 routing cache 的默认选择逻辑收口到显式 helper
  - 已进一步新增 `resolve_runtime_adapter_profile(...)`，统一输出 `event_sink_kind + routing_cache_kind`
  - 已把 `EventSinkKind::Redis`、`RoutingCacheKind::SharedRedis`、alive-ring 相关 helper/常量收紧到 `redis-backend` feature 边界内，避免默认构建残留死分支
  - 已修正默认无 `redis-backend` 时的测试边界：
    - `tests/event_sink.rs` 改为仅在 `redis-backend` 下编译
    - `bootstrap` 中 Redis 专属断言改为按 feature 分流
    - `tests/snapshot_sync.rs` 中 `alive_ring_router` 改为条件编译字段
    - `proxy/entry.rs` 中 alive-ring 专属测试与 test helper 改为按 feature 编译
  - 已通过 `app::bootstrap_tests::select_routing_cache_kind_stays_local_without_shared_redis`
  - 已通过 `app::bootstrap_tests::resolve_runtime_adapter_profile_uses_control_plane_http_and_local_cache_without_redis`
  - 已通过 `app::bootstrap_tests::resolve_runtime_adapter_profile_prefers_redis_backends_when_available`
  - 已通过 `env RUSTFLAGS=-Dwarnings cargo check -p data-plane --no-default-features`
- `resolve_runtime_adapter_profile(...)` 输入：
  - `ProductEdition`
  - `control_plane_base_url`
  - `shared_routing_cache_enabled`
  - `redis_url`
- `resolve_runtime_adapter_profile(...)` 输出：
  - `event_sink_kind`
  - `routing_cache_kind`
- 已通过 `env RUSTFLAGS=-Dwarnings cargo test -p data-plane --no-default-features --lib resolve_runtime_adapter_profile -- --nocapture`
- 标注所有 `#[cfg(feature = "redis-backend")]` 变更点。

### Workstream 3: Control-Plane Store Boundary Split

**Files:**
- Modify: `services/control-plane/src/store.rs`
- Modify: `services/control-plane/src/store/defs.rs`
- Modify: `services/control-plane/src/store/in_memory_core.rs`
- Modify: `services/control-plane/src/store/sqlite_backed.rs`
- Modify: `services/control-plane/src/store/postgres.rs`
- Modify: `services/control-plane/src/store/trait_impl.rs`
- Modify: `services/control-plane/src/store/family_snapshot.rs`
- Modify: `services/control-plane/src/store/migration.rs`
- Modify: `services/control-plane/src/import_jobs/store_impl.rs`

**Deliverables:**
- 把当前“大一统” `ControlPlaneStore` 拆成过渡性细粒度 ports：
  - `SnapshotPolicyStore`
  - `TenantCatalogStore`
  - `OAuthRuntimeStore`
  - `ImportJobStorePort`
  - `EditionMigrationStore`
- 允许先保留一个过渡 facade，但 facade 不再暴露 `PgPool`。
- SQLite 与 Postgres 都要对齐到同一组 ports；不接受“SQLite 继续特殊一层”。
- 为后续阶段提供明确 constructor：
  - `build_sqlite_store_ports(...)`
  - `build_postgres_store_ports(...)`

**Verification:**
- `cargo check -p control-plane --bin codex-pool-personal`
- `cargo test -p control-plane postgres_repo -- --nocapture`
- `cargo test -p control-plane integration -- --nocapture`

**Completion Notes:**
- 已在 `store/defs.rs` 新增过渡 ports：
  - `SnapshotPolicyStore`
  - `TenantCatalogStore`
  - `OAuthRuntimeStore`
  - `EditionMigrationStore`
  - `RuntimeStorePorts`
- 已为 `InMemoryStore` / `SqliteBackedStore` / `PostgresStore` 对齐到同一组 ports，并新增：
  - `build_sqlite_store_ports(...)`
  - `build_postgres_store_ports(...)`
- 已移除 facade 对 `PgPool` 的直接暴露，`PostgresStore` 改为只保留 `clone_pool()`；相关测试已同步改造。
- 已修正 `sqlite_backed.rs` 与 `store/migration.rs` 在新增 blanket impl 后出现的方法歧义，显式回到 `ControlPlaneStore` 分派。
- Ports 到实现的当前映射：
  - `SnapshotPolicyStore` -> `InMemoryStore` / `SqliteBackedStore` / `PostgresStore`
  - `TenantCatalogStore` -> `InMemoryStore` / `SqliteBackedStore` / `PostgresStore`
  - `OAuthRuntimeStore` -> `InMemoryStore` / `SqliteBackedStore` / `PostgresStore`
  - `EditionMigrationStore` -> `InMemoryStore` / `SqliteBackedStore` / `PostgresStore`
- 旧 `ControlPlaneStore` 仍作为过渡 facade 保留，用于组合根和既有调用点平滑迁移，但 backend-specific primitive 已从 public surface 收口。

### Workstream 4: Control-Plane Usage Backend Split

**Files:**
- Modify: `services/control-plane/src/usage/mod.rs`
- Modify: `services/control-plane/src/usage/sqlite_repo.rs`
- Modify: `services/control-plane/src/usage/postgres_repo.rs`
- Modify: `services/control-plane/src/usage/redis_reader.rs`
- Modify: `services/control-plane/src/usage/clickhouse_repo/**`
- Modify: `services/control-plane/src/usage/worker.rs`
- Modify: `services/control-plane/src/bin/usage-worker.rs`
- Modify: `services/control-plane/tests/dependency_boundaries.rs`

**Deliverables:**
- 使用统一 usage ports：
  - `UsageIngestRepository`
  - `UsageQueryRepository`
  - `UsageAggregationRuntime`
- 明确 edition 到 usage backend topology 的映射：
  - `personal = sqlite`
  - `team = postgres`
  - `business = redis + usage-worker + clickhouse`
- `usage-worker` 只在 `business` 构建路径存在。
- 补齐 control-plane dependency boundary test：
  - `personal` tree 不包含 `sqlx-postgres` / `redis` / `clickhouse` / `lettre`
  - `team` tree 不包含 `redis` / `clickhouse` / `lettre`

**Verification:**
- `cargo test -p control-plane --test dependency_boundaries -- --nocapture`
- `cargo check -p control-plane --no-default-features --features sqlite-backend --bin codex-pool-personal`
- `cargo check -p control-plane --no-default-features --features postgres-backend --bin codex-pool-team`
- `cargo check -p control-plane --no-default-features --features postgres-backend,redis-backend,clickhouse-backend,smtp-backend --bin codex-pool-business --bin usage-worker`

**Completion Notes:**
- 已把 usage topology 固化为 runtime/backend family 选择，而不是 edition feature 混用：
  - `personal` = SQLite store + SQLite usage query/ingest
  - `team` = Postgres store + Postgres usage query/ingest
  - `business` = Postgres store + ClickHouse usage query + Redis stream ingestion + `usage-worker`
- `usage/mod.rs` 与 `usage/migration.rs` 已按 feature gate 收口：
  - `clickhouse-backend` 才编译 ClickHouse query path
  - `redis-backend` 才编译 Redis ingestion/worker path
- `Cargo.toml` 已把 `usage-worker` 限制到 `redis-backend,clickhouse-backend` 路径。
- `services/control-plane/tests/dependency_boundaries.rs` 已覆盖：
  - `personal` tree 不含 `sqlx-postgres` / `redis` / `clickhouse` / `lettre`
  - `team` tree 不含 `redis` / `clickhouse` / `lettre`
- 本 workstream 最终以阶段检查与最终验收矩阵收尾，不再单独保留 integration worktree 的额外补线任务。

### Workstream 5: Tenant Session Core And Self-Service Adapter

**Files:**
- Modify: `services/control-plane/src/tenant.rs`
- Modify: `services/control-plane/src/tenant/auth_session.rs`
- Modify: `services/control-plane/src/tenant/admin_ops.rs`
- Modify: `services/control-plane/src/tenant/api_keys_credits.rs`
- Modify: `services/control-plane/src/tenant/audit_and_utils.rs`
- Create: `services/control-plane/src/tenant/session_core.rs`
- Create: `services/control-plane/src/tenant/self_service.rs`

**Deliverables:**
- 把 tenant JWT、cookie、principal、impersonation、session verification 收口到 `session_core.rs`。
- 把注册、邮箱验证码、密码重置、SMTP 发送全部收口到 `self_service.rs`。
- `team` 保留 tenant portal 登录，但不编译 self-service/SMTP。
- `personal` 不暴露 tenant portal 路径；如果内部仍要复用 session core，也只能通过 capability 封口，不允许路由泄漏。

**Verification:**
- `cargo test -p control-plane i18n_error_locale -- --nocapture`
- `cargo test -p control-plane api -- --nocapture`
- `cargo check -p control-plane --no-default-features --features postgres-backend --bin codex-pool-team`
- `cargo check -p control-plane --no-default-features --features sqlite-backend --bin codex-pool-personal`

**Completion Notes:**
- 已将 tenant 认证实现拆分为：
  - `session_core.rs`：JWT、cookie、principal、impersonation、登录校验
  - `self_service.rs`：注册、邮箱验证、找回密码、重置密码、SMTP 发送
- `tenant.rs` 已按 backend family gate 收口：
  - `postgres-backend` 才编译 auth/session/admin/billing audit 相关模块
  - 非 `postgres-backend` 统一走 `tenant/no_postgres.rs`
- 所有 self-service 入口都已显式要求 `smtp-backend`：
  - `register`
  - `verify_email`
  - `forgot_password`
  - `reset_password`
- 在无 `smtp-backend` 时，上述入口统一返回稳定错误：`tenant self-service requires the smtp-backend cargo feature`。
- 验证结果表明：
  - `team` 保留 tenant portal 登录
  - `team` 继续隐藏 self-service / credit 路径
  - `personal` 通过 capability shell routing 回落到 admin shell，不暴露 tenant portal 首屏

### Workstream 6: Billing Core Extraction

**Files:**
- Modify: `services/control-plane/src/cost.rs`
- Modify: `services/control-plane/src/tenant/billing_reconcile.rs`
- Modify: `services/control-plane/src/tenant/types_and_runtime.rs`
- Modify: `services/control-plane/src/app/core_handlers/billing_runtime.rs`
- Create: `services/control-plane/src/tenant/billing_core.rs`

**Deliverables:**
- 把 pricing resolve、authorize、capture、release、reconcile 的核心决策收口到 `billing_core.rs`。
- 让 route handlers 与后台 reconcile loop 共用同一套 billing policy，不再重复埋在 `types_and_runtime.rs` 大文件中。
- `personal/team` 明确只支持 `cost_report_only`，不编译 credit billing backend 路径。
- `business` 才保留完整 credit billing + reconcile runtime。

**Verification:**
- `cargo test -p control-plane usage_worker -- --nocapture`
- `cargo test -p control-plane dashboard_logs_billing_e2e -- --nocapture`
- `cargo check -p control-plane --no-default-features --features postgres-backend --bin codex-pool-team`
- `cargo check -p control-plane --no-default-features --features postgres-backend,redis-backend,clickhouse-backend,smtp-backend --bin codex-pool-business`

**Completion Notes:**
- 已新增 `tenant/billing_core.rs`，把 pricing/authorize/capture/release 相关纯策略从 `types_and_runtime.rs` 与 `audit_and_utils.rs` 抽离。
- `personal/team` 与 `business` 的最终 billing 行为表：
  - `personal` -> `cost_report_only`
  - `team` -> `cost_report_only`
  - `business` -> `credit_enforced`
- route handler 与后台 reconcile runtime 已共享同一套 billing policy helper，不再各自埋逻辑。
- 仍依赖 Postgres 的 billing 数据入口保留在 tenant runtime / reconcile 持久化路径中；纯 pricing policy 已 backend-neutral。
- `billing_reconcile_enabled` 现在由 runtime profile 的 `BillingMode` 决定，只在 `business` 路径开启。

### Workstream 7: Control-Plane Composition Root Refactor

**Files:**
- Modify: `services/control-plane/Cargo.toml`
- Modify: `services/control-plane/src/main.rs`
- Modify: `services/control-plane/src/config.rs`
- Modify: `services/control-plane/src/app.rs`
- Modify: `services/control-plane/src/single_binary.rs`
- Modify: `services/control-plane/src/bin/codex-pool-personal.rs`
- Modify: `services/control-plane/src/bin/codex-pool-team.rs`
- Modify: `services/control-plane/src/bin/codex-pool-business.rs`
- Modify: `services/control-plane/src/bin/edition-migrate.rs`

**Deliverables:**
- 把 `main.rs` 重构成明确的装配流程：
  - `resolve_runtime_edition`
  - `resolve_backend_profile`
  - `build_store_bundle`
  - `build_usage_bundle`
  - `build_tenant_bundle`
  - `register_background_tasks`
  - `build_http_app`
- Cargo features 固化为 backend family；entrypoint 不再隐式依赖“大而全默认编译”。
- `personal/team` 的 single-binary merge 保留现有外部行为，但内部只消费 runtime profile，不再四处散落 edition if/else。
- 保持 bin 名与 env precedence 测试继续通过。

**Verification:**
- `cargo check -p control-plane --no-default-features --features sqlite-backend --bin codex-pool-personal`
- `cargo check -p control-plane --no-default-features --features postgres-backend --bin codex-pool-team`
- `cargo check -p control-plane --no-default-features --features postgres-backend,redis-backend,clickhouse-backend,smtp-backend --bin codex-pool-business --bin edition-migrate`
- `cargo test -p control-plane single_binary::tests -- --nocapture`
- `cargo test -p control-plane --lib --bins`

**Completion Notes:**
- 已新增 `runtime_profile.rs`，引入：
  - `DeploymentShape`
  - `StoreBackendFamily`
  - `UsageQueryBackendFamily`
  - `UsageIngestBackendFamily`
  - `BackendProfile`
  - `resolve_backend_profile(...)`
- edition/backend/profile 对照表：
  - `personal` -> `SingleBinary + Sqlite + Sqlite query/ingest + CostReportOnly`
  - `team` -> `SingleBinary + Postgres(or InMemory fallback) + Postgres query/ingest + CostReportOnly`
  - `business` -> `MultiService + Postgres(or InMemory fallback) + ClickHouse query + Redis ingestion + CreditEnforced`
- `main.rs` 已按组合根 helper 收口：
  - `resolve_runtime_edition`
  - `resolve_backend_profile`
  - `build_store_bundle`
  - `build_usage_bundle`
  - `build_app_with_store_and_services`
  - 后台任务注册沿 runtime profile 和 capability 决策执行
- `Cargo.toml` 已固化 backend family features：
  - `sqlite-backend`
  - `postgres-backend`
  - `redis-backend`
  - `clickhouse-backend`
  - `smtp-backend`
- 当前阶段没有残留 manifest 冲突；三档 control-plane build matrix 与 `usage-worker` / `edition-migrate` 都已通过最终验收命令。

### Workstream 8: Contracts, Guardrails, Docs

**Files:**
- Modify: `services/control-plane/tests/dependency_boundaries.rs`
- Modify: `services/data-plane/tests/dependency_boundaries.rs`
- Modify: `services/control-plane/tests/support/mod.rs`
- Modify: `services/data-plane/tests/support/mod.rs`
- Modify: `frontend/src/lib/edition-shell-routing.ts`
- Modify: `frontend/src/lib/edition-shell-routing.test.ts`
- Modify: `README.md`
- Modify: `docs/editions-and-migration.md`

**Deliverables:**
- 把 edition/dependency/capability 护栏测试补成长期资产：
  - dependency boundary tests
  - edition assembly smoke tests
  - frontend capability routing tests
- README 与迁移文档同步反映新的 backend family feature 组合与验证命令。
- 明确 `personal/team/business` 的 build matrix 和 acceptance matrix。

**Verification:**
- `cargo test -p control-plane --test dependency_boundaries -- --nocapture`
- `cargo test -p data-plane --test dependency_boundaries -- --nocapture`
- `cd frontend && npm test -- edition-shell-routing`
- `cd frontend && npm run build`

**Completion Notes:**
- 最终 acceptance matrix（2026-03-20）：
  - `cargo test -p codex-pool-core`
  - `cargo test -p control-plane --test dependency_boundaries -- --nocapture`
  - `cargo test -p data-plane --test dependency_boundaries -- --nocapture`
  - `env RUSTFLAGS=-Dwarnings cargo check -p control-plane --no-default-features --features sqlite-backend --bin codex-pool-personal`
  - `env RUSTFLAGS=-Dwarnings cargo check -p control-plane --no-default-features --features postgres-backend --bin codex-pool-team`
  - `env RUSTFLAGS=-Dwarnings cargo check -p control-plane --no-default-features --features postgres-backend,redis-backend,clickhouse-backend,smtp-backend --bin codex-pool-business --bin usage-worker --bin edition-migrate`
  - `env RUSTFLAGS=-Dwarnings cargo check -p data-plane --no-default-features`
  - `env RUSTFLAGS=-Dwarnings cargo check -p data-plane --no-default-features --features redis-backend`
  - `cargo test -p control-plane single_binary::tests -- --nocapture`
  - `cargo test -p control-plane --lib --no-default-features --features postgres-backend,redis-backend,clickhouse-backend,smtp-backend -- --nocapture`
  - `cargo test -p data-plane compatibility -- --nocapture`
  - `cargo test -p data-plane compatibility_ws -- --nocapture`
  - `cd frontend && node --experimental-strip-types --test src/lib/edition-shell-routing.test.ts`
  - `cd frontend && npm run build`
- 外部契约验证点：
  - core edition/capability/error/snapshot/runtime contract re-export 兼容
  - control-plane dependency tree 对 personal/team 的重依赖裁剪
  - data-plane HTTP / WebSocket compatibility 契约
  - frontend shell routing capability gating
  - single-binary merge 行为
- 剩余债务：
  - `crates/codex-pool-core/src/api.rs` 中标记为 `to_move(...)` 的 control-plane 专用 DTO 仍为过渡保留，后续可继续从 core 迁出，但不阻塞本轮架构重构验收。

## Cross-Cutting Integration Duties

所有跨 workstream 的统一收口都由我在当前工作区直接完成，职责固定：

- 统一解决：
  - `Cargo.toml`
  - shared import/re-export
  - crate public API 对齐
  - 跨阶段测试修线
- 统一补最后一层“只能在全局看清”的改动：
  - 共享 helper 的最终归属
  - 跨 crate feature gate
  - 文档命令与真实构建矩阵对齐

## Acceptance Plan

### Fast Checks Per Workstream

- 当前 workstream 只跑自己的最小验证集合。
- 不允许在早期阶段默认跑整仓全量。

### Final Acceptance In Current Workspace

在当前工作区完成阶段收尾或最终验收时，必须串行跑以下命令：

```bash
cargo test -p codex-pool-core
cargo test -p control-plane --test dependency_boundaries -- --nocapture
cargo test -p data-plane --test dependency_boundaries -- --nocapture
cargo check -p control-plane --no-default-features --features sqlite-backend --bin codex-pool-personal
cargo check -p control-plane --no-default-features --features postgres-backend --bin codex-pool-team
cargo check -p control-plane --no-default-features --features postgres-backend,redis-backend,clickhouse-backend,smtp-backend --bin codex-pool-business --bin usage-worker --bin edition-migrate
cargo check -p data-plane --no-default-features
cargo check -p data-plane --no-default-features --features redis-backend
cargo test -p control-plane single_binary::tests -- --nocapture
cargo test -p data-plane compatibility -- --nocapture
cargo test -p data-plane compatibility_ws -- --nocapture
cd frontend && node --experimental-strip-types --test src/lib/edition-shell-routing.test.ts
cd frontend && npm run build
```

### Release Acceptance Scenarios

主 agent 需要手工确认以下场景不回归：

- `personal`：
  - 单部署体验仍成立
  - SQLite 仍是唯一基础存储
  - build tree 不包含 Postgres / Redis / ClickHouse / SMTP
- `team`：
  - 单部署体验仍成立
  - 多租户与 tenant portal 仍成立
  - build tree 不包含 Redis / ClickHouse / SMTP
- `business`：
  - 完整 backend stack 仍可编译
  - `usage-worker`、`edition-migrate` 仍可用
- 跨版本：
  - capability endpoint 语义不变
  - `edition-migrate` CLI 语义不变
  - `x-request-id` 与 request correlation 不变
  - `CONTROL_PLANE_INTERNAL_AUTH_TOKEN` 契约不变

## Important Interface Changes

这些改动属于“内部接口重构”，实施时必须发生，但对外契约不应退化：

- `codex-pool-core`
  - 新增内部模块：
    - `edition`
    - `error`
    - `snapshot`
    - `runtime_contract`
  - `ProductEdition` 与 `SystemCapabilitiesResponse` 的导出位置允许变化，但 public re-export 必须保留兼容层。
- `control-plane`
  - 新增内部 runtime profile 概念，用于表达：
    - edition
    - backend family set
    - deployment shape
  - `ControlPlaneStore` 允许作为过渡 facade 短暂保留，但最终不得继续暴露 backend-specific primitives。
- `data-plane`
  - adapter 选择逻辑集中到 runtime profile helper，不再散落于 `bootstrap.rs` 多处条件分支。

## Assumptions And Defaults

- 这轮重构接受一次性较大改动，不追求“每一层只动一点”的最小修补路线。
- 不新建第二个 core crate，直接净化现有 `codex-pool-core`。
- `team` 不编译 SMTP/self-service 路径。
- `personal` 不暴露 tenant portal，不编译 Postgres / Redis / ClickHouse / SMTP 路径。
- `business` 继续保留 ClickHouse、Redis、SMTP 和完整 credit billing。
- 如果某个 control-plane DTO 目前同时被两边引用，但本轮来不及安全迁出，可先在 `codex-pool-core` 过渡保留并加 `to_move` 分组，必须在本计划回填中记录剩余债务。

## Todo

- [x] 把本计划改写为“当前会话主 agent 顺序执行”的实施版本
- [x] 在当前工作区按顺序推进 8 个 workstreams，并持续回填阶段记录
- [x] 完成 `codex-pool-core` 模块净化与 capability single source of truth 固化
- [x] 为 `data-plane` 补齐 dependency boundary tests 并收口 runtime adapter 选择
- [x] 拆出 `control-plane` store ports，移除 facade 对 `PgPool` 的暴露
- [x] 收口 `control-plane` usage 三层 backend topology
- [x] 拆出 tenant session core 与 self-service adapter
- [x] 提取 billing core，并把 `personal/team` 固化为 `cost_report_only`
- [x] 重构 `control-plane` 组合根与 backend family feature 装配
- [x] 补齐 contracts/docs workstream，包括 frontend capability 护栏
- [x] 在当前工作区完成跨 workstream 收口、阶段检查和最终验收矩阵
- [x] 回填本计划的完成状态、验证命令和剩余债务
