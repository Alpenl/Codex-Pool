# Dev Superadmin Session Design

**Goal:** 提供一个仅供开发期使用的 `scripts/dev-superadmin-session.sh`，复用现有 `control-plane` 管理员登录、租户 impersonation 和 `data-plane` internal token 机制，输出可直接 `eval` 的环境变量，方便 Agent 与终端获得“事实上的全链路调试会话”。

**Scope:**
- 新增 `scripts/dev-superadmin-session.sh`
- 新增最小 shell smoke test
- 在 `AGENTS.md` 中补充脚本用途与用法
- 不改 `README.md`
- 不新增后端接口

## Existing Building Blocks

- 管理员登录：`POST /api/v1/admin/auth/login`
  - 返回 `access_token`
  - 同时设置 admin session cookie
- 管理员 impersonation：`POST /api/v1/admin/impersonations`
  - 请求体：`{ tenant_id, reason }`
  - 返回 `access_token`、`session_id`
- internal service token：
  - 来自环境变量 `CONTROL_PLANE_INTERNAL_AUTH_TOKEN`
  - 用于 `data-plane` internal/debug 路由

## Chosen UX

脚本默认输出 shell `export` 语句，便于：

```bash
eval "$(./scripts/dev-superadmin-session.sh --tenant-name default)"
```

然后后续命令可直接复用：

- `"$CP_ADMIN_AUTH_HEADER"`
- `"$CP_TENANT_AUTH_HEADER"`
- `"$CP_INTERNAL_AUTH_HEADER"`

## CLI Contract

### Inputs

- `--tenant-id <uuid>`：显式指定 tenant
- `--tenant-name <name>`：按名称解析 tenant
- `--reason <text>`：impersonation reason，默认 `dev-superadmin-session`
- `--cp-base-url <url>`：默认 `http://127.0.0.1:8090`
- `--dp-base-url <url>`：默认 `http://127.0.0.1:8091`
- `--skip-tenant`：只输出 admin/internal 会话，不生成 tenant 会话
- `--format shell|json`：默认 `shell`

### Environment Dependencies

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `CONTROL_PLANE_INTERNAL_AUTH_TOKEN`

## Output Contract

默认 `shell` 模式输出：

- `CP_BASE_URL`
- `DP_BASE_URL`
- `CP_ADMIN_BEARER`
- `CP_INTERNAL_BEARER`
- `CP_TENANT_BEARER`
- `CP_ADMIN_AUTH_HEADER`
- `CP_INTERNAL_AUTH_HEADER`
- `CP_TENANT_AUTH_HEADER`
- `CP_DEBUG_TENANT_ID`
- `CP_IMPERSONATION_SESSION_ID`

若 `--skip-tenant`，则 tenant 相关变量导出为空字符串。

## Tenant Resolution Rules

- `--tenant-id` 优先级最高
- 否则如果有 `--tenant-name`，调用 `GET /api/v1/admin/tenants` 查找同名 tenant
- 否则：
  - 如果 admin tenant 列表仅有一个条目，则自动使用它
  - 如果没有 tenant 或有多个 tenant，则报错并提示显式指定

## Safety / Failure Behavior

- 缺必需环境变量时直接失败
- 管理员登录失败时直接失败
- tenant 解析失败时直接失败
- impersonation 失败时直接失败
- 输出错误到 `stderr`
- 成功输出只写到 `stdout`

## Testing Strategy

- 增加 shell smoke test，使用 stub `curl` 覆盖：
  - 缺失 env 报错
  - admin login 成功并输出 shell exports
  - `--tenant-name` 解析 tenant 并生成 impersonation token
  - `--skip-tenant` 不调用 impersonation

## Documentation Target

- 仅更新 `AGENTS.md`
- 不更新 `README.md`
