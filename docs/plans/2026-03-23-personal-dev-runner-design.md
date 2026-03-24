# Personal 开发启动脚本设计

## 背景

当前 `personal` 开发启动经常通过手写长命令完成，容易出现几个问题：

- `CONTROL_PLANE_DATABASE_URL` 使用相对路径，实际命中的 SQLite 文件不稳定。
- 开发者误以为在线实例正在使用某个 SQLite 路径，实际上命中了另一份数据库。
- `personal` 二进制会内置并服务主仓库当前编译进二进制的前端，但新前端开发需要继续使用 `frontend-antigravity` 的 Vite dev server，因此需要明确“后端入口”和“前端开发入口”的职责边界。

## 目标

提供一个仅供开发期使用的脚本，稳定启动 `codex-pool-personal`，并把 SQLite 固定到仓库内 `.codex/data/personal` 下的绝对路径，避免继续出现相对路径串库问题。

## 设计决策

### 方案选择

本轮采用单脚本前台启动，而不是修改现有通用 `restart_backend_dev.sh`：

- 新增 `scripts/run_personal_dev.sh`
- 只负责启动 `codex-pool-personal`
- 不负责启动前端 dev server
- 启动后明确提示：新前端请手动在 `frontend-antigravity` worktree 里运行

这样可以避免把 `personal` 的特殊逻辑揉进通用后端重启脚本，也能让开发者清楚知道当前在线实例用的是哪份 SQLite。

### 数据目录

SQLite 固定落在：

`<repo>/.codex/data/personal/codex-pool-personal.sqlite`

原因：

- `.codex/` 已在仓库 `.gitignore` 中忽略，不会污染版本控制。
- 路径稳定，不依赖当前 shell 工作目录。
- 不放在 `target/` 下，避免被构建清理误伤。

### 环境变量策略

脚本执行时：

1. 进入仓库根目录。
2. 自动 `mkdir -p .codex/data/personal`。
3. `source .env.runtime` 作为默认开发环境。
4. 强制覆写：
   - `CODEX_POOL_EDITION=personal`
   - `CONTROL_PLANE_DATABASE_URL=sqlite://<absolute path>?mode=rwc`
5. 保留可由外部覆盖的变量：
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `RUST_LOG`

### 输出行为

脚本启动前输出：

- 实际 SQLite 绝对路径
- `CONTROL_PLANE_BASE_URL`
- 当前管理员用户名
- 明确提示 `8090` 提供的是 `personal` 二进制自带前端，前端开发请使用单独的 Vite dev server

## 不做的事

- 不在本轮脚本里自动启动 `frontend-antigravity` 前端
- 不自动清空或重建现有 SQLite
- 不改现有 `scripts/restart_backend_dev.sh`
- 不引入 tmux 编排
