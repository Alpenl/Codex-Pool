# Personal Runtime Light Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `personal` 单进程版从“自环 HTTP 快照轮询”改成真正轻量的进程内同步，修复空闲高 CPU 问题，同时保持业务层共用。

**Architecture:** `personal` 只在 runtime/wiring 层做专属装配。control-plane 继续负责状态写入与持久化，data-plane 继续负责路由与代理，但二者在 `personal` 下通过进程内 revision 通知和全量 snapshot 同步，而不是通过 `/api/v1/data-plane/snapshot/events` 自己轮询自己。顺手修正 SQLite snapshot cursor 语义，避免同类死循环再次出现。

**Tech Stack:** Rust, Axum, Tokio `watch`, SQLite, 现有 `ControlPlaneStore` / `DataPlaneSnapshot` 模型

---

## Execution Status

- [x] Task 1: 修正 SQLite full snapshot 的 `cursor/revision` 语义，并补回归测试
- [x] Task 2: 为 `SqliteBackedStore` 增加 revision watch 通知，并补回归测试
- [x] Task 3: 为 data-plane builder 增加关闭 HTTP snapshot poller 的装配能力
- [x] Task 4: `personal` single-binary 改为进程内 snapshot 同步，并把 request log ingest 改为进程内写入
- [x] Task 5: 完成聚焦验证并整理提交范围

### Verification Notes

- 已通过 `cargo check -p control-plane --lib`
- 已通过 `cargo check -p control-plane --bins`
- 已通过 `cargo test -p control-plane --lib merged_personal_app_tracks_store_updates_without_http_snapshot_poller -- --nocapture`
- 已通过 `cargo test -p control-plane --lib sqlite_backed_store_snapshot_cursor_matches_revision -- --nocapture`
- 已通过 `cargo test -p control-plane --lib sqlite_backed_store_revision_subscription_observes_writes -- --nocapture`

### Task 1: 锁住当前 bug 的回归测试

**Files:**
- Modify: `services/control-plane/src/store/sqlite_backed.rs`

**Step 1: Write the failing test**

- 为 SQLite store 增加测试，断言 full snapshot 返回的 `cursor` 与当前 revision 一致，而不是 `0`。
- 补一个 stale cursor 场景，确认“先 full snapshot，再 events poll”不会立即得到 `cursor_gone`。

**Step 2: Run test to verify it fails**

Run: `cargo test -p control-plane sqlite_backed_store_ -- --nocapture`

Expected: 新增断言失败，显示 current revision 与 snapshot cursor 不一致。

**Step 3: Write minimal implementation**

- 修正 SQLite/in-memory snapshot 的 `cursor` 语义，让 full snapshot 至少能返回当前 revision。

**Step 4: Run test to verify it passes**

Run: `cargo test -p control-plane sqlite_backed_store_ -- --nocapture`

Expected: 新增和现有 sqlite store 测试通过。

### Task 2: 给 Personal store 增加轻量 revision 通知

**Files:**
- Modify: `services/control-plane/src/store/sqlite_backed.rs`

**Step 1: Write the failing test**

- 新增测试，创建 `SqliteBackedStore` 后订阅 revision 更新；执行一次会改变 revision 的写操作；断言订阅方能观察到 revision 前进。

**Step 2: Run test to verify it fails**

Run: `cargo test -p control-plane sqlite_backed_store_revision_ -- --nocapture`

Expected: 因为还没有订阅能力或 revision 未推送而失败。

**Step 3: Write minimal implementation**

- 在 `SqliteBackedStore` 中增加 `tokio::sync::watch` revision sender/receiver。
- 在持久化成功后推送最新 revision。

**Step 4: Run test to verify it passes**

Run: `cargo test -p control-plane sqlite_backed_store_revision_ -- --nocapture`

Expected: revision 推送测试通过。

### Task 3: 让 data-plane builder 支持关闭 HTTP snapshot poller

**Files:**
- Modify: `services/data-plane/src/app/bootstrap.rs`
- Test: `services/data-plane/src/app/bootstrap.rs`

**Step 1: Write the failing test**

- 增加一个 builder 级测试，断言在显式禁用 snapshot poller 时，不会启动 HTTP snapshot 同步路径。

**Step 2: Run test to verify it fails**

Run: `cargo test -p data-plane build_app_ --lib -- --nocapture`

Expected: 因为 builder 还没有该开关而失败。

**Step 3: Write minimal implementation**

- 将 data-plane app 构建过程抽出 runtime bundle 或等价结构，允许 single-binary runtime 拿到 state。
- 加入 `enable_snapshot_poller` 选项，默认行为保持不变。

**Step 4: Run test to verify it passes**

Run: `cargo test -p data-plane build_app_ --lib -- --nocapture`

Expected: 相关 builder 测试通过。

### Task 4: 在 Personal single-binary 中接上进程内 snapshot 同步

**Files:**
- Modify: `services/control-plane/src/main.rs`
- Modify: `services/control-plane/src/single_binary.rs`
- Modify: `services/data-plane/src/app/bootstrap.rs`
- Test: `services/control-plane/src/single_binary.rs`

**Step 1: Write the failing test**

- 为 `personal` merged app 增加测试：启动后写入/变更 upstream account，再访问 data-plane 侧统计或路由可见状态，断言无需 HTTP events poller 也能看到更新。

**Step 2: Run test to verify it fails**

Run: `cargo test -p control-plane merged_personal_app_ -- --nocapture`

Expected: 因为 merged runtime 还没有进程内同步而失败。

**Step 3: Write minimal implementation**

- `main.rs` 在 `personal` 下保留 concrete `Arc<SqliteBackedStore>`，同时以 trait object 形式交给 control-plane app。
- `single_binary.rs` 在 `personal` 下：
  - 构建 data-plane runtime 时关闭 HTTP snapshot poller
  - 启动时先从 store 拉一次 full snapshot 并应用到 data-plane state
  - 启一个轻量 Tokio 任务监听 revision 变化，收到后重新拉 full snapshot 并应用
- `team` 与 `business` 保持现有路径不变。

**Step 4: Run test to verify it passes**

Run: `cargo test -p control-plane merged_personal_app_ -- --nocapture`

Expected: Personal merged app 测试通过，Team 现有测试不回归。

### Task 5: 验证并收尾

**Files:**
- Modify if needed: `README.md`

**Step 1: Run focused verification**

Run: `cargo test -p control-plane sqlite_backed_store_ merged_personal_app_ -- --nocapture`

Run: `cargo test -p data-plane --lib build_app_ -- --nocapture`

**Step 2: Run broader safety net**

Run: `cargo test -p control-plane --lib`

Run: `cargo test -p data-plane --lib --bins`

**Step 3: Update docs if behavior changed**

- 如果 README 中对 `personal` 运行机制有误导描述，补一句“single-binary personal uses in-process snapshot sync”。

**Step 4: Commit**

```bash
git add docs/plans/2026-03-17-personal-runtime-light-split.md services/control-plane/src/main.rs services/control-plane/src/single_binary.rs services/control-plane/src/store/sqlite_backed.rs services/data-plane/src/app/bootstrap.rs
git commit -m "refactor(control-plane): slim personal single-binary sync" -m "Replace personal self-poll snapshot wiring with in-process runtime synchronization."
```
