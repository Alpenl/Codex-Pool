# Dev Superadmin Session Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `scripts/dev-superadmin-session.sh`，让开发者或 Agent 可复用现有环境变量和现有 API，快速拿到 admin、tenant、internal 三套调试会话导出。

**Architecture:** 脚本本身不新增任何后端能力，只编排三步：管理员登录、tenant 解析、管理员 impersonation。默认输出 `export` 语句；同时在 `AGENTS.md` 明确用法，但不触碰 `README.md`。测试使用 shell smoke test 和 stub `curl` 做 TDD。

**Tech Stack:** Bash, curl, jq, existing control-plane admin APIs

---

### Task 1: 建立 failing shell smoke test

**Files:**
- Create: `scripts/tests/dev_superadmin_session_smoke.sh`
- Test: `scripts/tests/dev_superadmin_session_smoke.sh`

**Step 1: 写失败测试**

- 覆盖四个场景：
  - 缺 `ADMIN_USERNAME`
  - 仅 admin/internal 成功
  - `--tenant-name` 成功解析并 impersonate
  - `--skip-tenant` 不 impersonate

**Step 2: 运行并确认失败**

Run: `bash scripts/tests/dev_superadmin_session_smoke.sh`
Expected: 因脚本文件不存在或行为不满足而失败

### Task 2: 实现脚本最小功能

**Files:**
- Create: `scripts/dev-superadmin-session.sh`

**Step 1: 实现参数解析**

- 支持：
  - `--tenant-id`
  - `--tenant-name`
  - `--reason`
  - `--cp-base-url`
  - `--dp-base-url`
  - `--skip-tenant`
  - `--format`

**Step 2: 实现环境变量校验**

- 校验：
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `CONTROL_PLANE_INTERNAL_AUTH_TOKEN`

**Step 3: 实现 admin login**

- `POST /api/v1/admin/auth/login`
- 解析 `access_token`

**Step 4: 实现 tenant 解析**

- `--tenant-id` 直接用
- `--tenant-name` 则 `GET /api/v1/admin/tenants`
- 未指定时：
  - 单 tenant 自动选
  - 否则失败

**Step 5: 实现 impersonation**

- `POST /api/v1/admin/impersonations`
- 解析 `session_id`、`access_token`

**Step 6: 输出 shell/json**

- `shell`：输出 `export KEY='value'`
- `json`：输出稳定 JSON

### Task 3: 让 smoke test 变绿

**Files:**
- Modify: `scripts/tests/dev_superadmin_session_smoke.sh`
- Modify: `scripts/dev-superadmin-session.sh`

**Step 1: 运行测试**

Run: `bash scripts/tests/dev_superadmin_session_smoke.sh`
Expected: PASS

**Step 2: 修复边界行为**

- 错误消息走 `stderr`
- 成功导出只走 `stdout`
- tenant 相关变量在 `--skip-tenant` 时为空

### Task 4: 更新 AGENTS 文档

**Files:**
- Modify: `AGENTS.md`

**Step 1: 补充脚本用法**

- 说明用途
- 说明典型调用方式
- 说明默认依赖的环境变量
- 说明不修改 `README.md`

### Task 5: 最终验证

**Files:**
- Test: `scripts/tests/dev_superadmin_session_smoke.sh`
- Test: `scripts/dev-superadmin-session.sh`
- Test: `AGENTS.md`

**Step 1: 运行 shell smoke test**

Run: `bash scripts/tests/dev_superadmin_session_smoke.sh`
Expected: PASS

**Step 2: 检查脚本语法**

Run: `bash -n scripts/dev-superadmin-session.sh`
Expected: PASS

**Step 3: 检查工作区差异**

Run: `git diff --check -- AGENTS.md scripts/dev-superadmin-session.sh scripts/tests/dev_superadmin_session_smoke.sh docs/plans/2026-03-19-dev-superadmin-session-design.md docs/plans/2026-03-19-dev-superadmin-session.md`
Expected: PASS
