# Frontend Page Archetypes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立可复用的页面 archetype 基础层，并将 `auth` 与 `ImportJobs` 作为首批样板迁移到新设计语言。

**Architecture:** 先抽取纯语义的页面层组件与变体配置，再用这些基础层重构 `auth` 和 `workspace`。本轮不改业务数据流，只收结构、视觉层级和移动端信息节奏。

**Tech Stack:** React 19、TypeScript、Tailwind v4、Framer Motion、现有 shadcn/ui 组件、Node `--test`

---

### Task 1: 定义页面 archetype 变体与纯函数配置

**Files:**
- Create: `frontend/src/lib/page-archetypes.ts`
- Test: `frontend/src/lib/page-archetypes.test.ts`

**Step 1: Write the failing test**

在 `frontend/src/lib/page-archetypes.test.ts` 中为以下行为写测试：
- `auth` 返回高表达但非特效化的容器配置
- `workspace` 返回短页头与主任务优先的配置
- 未知变体不会抛错，且返回安全兜底

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行页面 archetype 测试" --why "先确认新配置测试会失败" node --test frontend/src/lib/page-archetypes.test.ts
```

Expected: FAIL，因为 `page-archetypes.ts` 尚不存在。

**Step 3: Write minimal implementation**

在 `frontend/src/lib/page-archetypes.ts` 中实现最小配置层：
- `type PageArchetype = 'auth' | 'dashboard' | 'workspace' | 'detail' | 'settings'`
- `resolvePageArchetype(name)` 返回页面节奏、表面样式、页头强度、说明文字策略等纯配置

**Step 4: Run test to verify it passes**

Run:
```bash
shnote --what "验证页面 archetype 配置" --why "确认纯配置行为通过" node --test frontend/src/lib/page-archetypes.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/page-archetypes.ts frontend/src/lib/page-archetypes.test.ts
git commit -m "feat(frontend): add page archetype config" -m "Define reusable page archetype variants for auth and workspace surfaces."
```

### Task 2: 抽取共享页面语义组件

**Files:**
- Create: `frontend/src/components/layout/page-archetypes.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/index.css`
- Reference: `frontend/src/lib/page-archetypes.ts`

**Step 1: Write the failing test**

如果可以用纯函数覆盖，则补到 `frontend/src/lib/page-archetypes.test.ts`：
- `workspace` archetype 必须输出短页头和主/次面板分层配置
- `auth` archetype 必须输出舞台区与操作区分离配置

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行 archetype 行为扩展测试" --why "先让共享页面层要求以失败形式固定下来" node --test frontend/src/lib/page-archetypes.test.ts
```

Expected: FAIL，新增断言尚未满足。

**Step 3: Write minimal implementation**

在 `frontend/src/components/layout/page-archetypes.tsx` 中新增：
- `PageIntro`
- `BrandStage`
- `WorkspaceShell`
- `WorkspacePrimaryPanel`
- `WorkspaceSecondaryPanel`

在 `frontend/src/index.css` 中补充必要的轻量材质/间距规则，避免继续使用高强度发光/玻璃默认样式。

在 `frontend/src/components/layout/AppLayout.tsx` 中只做与新页面节奏兼容的最小补充，不做无关重构。

**Step 4: Run tests and static checks**

Run:
```bash
shnote --what "验证 archetype 基础层" --why "确认基础页面语义层和样式没有破坏构建" run "cd frontend && node --test src/lib/page-archetypes.test.ts && npm run lint && npm run build"
```

Expected: all PASS

**Step 5: Commit**

```bash
git add frontend/src/components/layout/page-archetypes.tsx frontend/src/components/layout/AppLayout.tsx frontend/src/index.css frontend/src/lib/page-archetypes.ts frontend/src/lib/page-archetypes.test.ts
git commit -m "feat(frontend): add page archetype primitives" -m "Create shared page intro, brand stage, and workspace shell primitives."
```

### Task 3: 将 admin/tenant 认证页迁移到 auth archetype

**Files:**
- Modify: `frontend/src/components/auth/auth-shell.tsx`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/tenant/TenantApp.tsx`
- Reference: `frontend/src/components/layout/page-archetypes.tsx`

**Step 1: Write the failing test**

为 `frontend/src/lib/page-archetypes.test.ts` 增加针对 `auth` 文案与区域策略的断言：
- 移动端品牌舞台应降级
- 表单区必须始终被标记为 primary interaction zone

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行 auth archetype 测试" --why "先固定认证页需要满足的新结构语义" node --test frontend/src/lib/page-archetypes.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

重构 `auth-shell.tsx`：
- 去掉 `Threads` / `ShinyText` 作为主视觉支柱
- 将品牌舞台区与表单容器解耦
- 保留品牌感，但靠排版、材质、节奏建立气质

同步调整 `Login.tsx` 与 `TenantApp.tsx`，确保两个入口都共享同一 archetype，而不是各自漂移。

**Step 4: Run checks and manual verification**

Run:
```bash
shnote --what "验证认证页重构" --why "确认 auth archetype 改造通过构建并适合人工走查" run "cd frontend && node --test src/lib/page-archetypes.test.ts && npm run lint && npm run build"
```

然后在浏览器中人工检查：
- admin login desktop / mobile
- tenant auth desktop / mobile

**Step 5: Commit**

```bash
git add frontend/src/components/auth/auth-shell.tsx frontend/src/pages/Login.tsx frontend/src/tenant/TenantApp.tsx frontend/src/lib/page-archetypes.ts frontend/src/lib/page-archetypes.test.ts frontend/src/components/layout/page-archetypes.tsx
git commit -m "feat(frontend): migrate auth flows to archetype shell" -m "Refine admin and tenant auth surfaces with the shared brand-stage archetype."
```

### Task 4: 将 ImportJobs 迁移到 workspace archetype

**Files:**
- Modify: `frontend/src/pages/ImportJobs.tsx`
- Reference: `frontend/src/components/layout/page-archetypes.tsx`
- Reference: `frontend/src/lib/page-archetypes.ts`

**Step 1: Write the failing test**

为 `frontend/src/lib/page-archetypes.test.ts` 增加 `workspace` 页面策略断言：
- 主任务区优先
- 次级统计默认降级
- 页头为短说明而非 hero

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行 workspace archetype 测试" --why "先固定工作台页面的任务优先规则" node --test frontend/src/lib/page-archetypes.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

重构 `frontend/src/pages/ImportJobs.tsx`：
- 将当前 hero 区改为短页头
- 让上传工作台成为页面第一视觉锚点
- 将预检统计与元信息收敛为摘要优先、细节后置
- 移动端优先保证上传与开始导入路径

**Step 4: Run checks and manual verification**

Run:
```bash
shnote --what "验证 ImportJobs 工作台改造" --why "确认 workspace archetype 在导入页落地后仍可构建并通过静态检查" run "cd frontend && node --test src/lib/page-archetypes.test.ts && npm run lint && npm run build"
```

人工检查：
- ImportJobs desktop
- ImportJobs mobile

**Step 5: Commit**

```bash
git add frontend/src/pages/ImportJobs.tsx frontend/src/components/layout/page-archetypes.tsx frontend/src/lib/page-archetypes.ts frontend/src/lib/page-archetypes.test.ts
git commit -m "feat(frontend): migrate import jobs to workspace archetype" -m "Refocus the import jobs page on task-first workspace structure."
```

### Task 5: 回归检查与文档收口

**Files:**
- Modify: `docs/plans/2026-03-17-frontend-page-archetypes-design.md`
- Modify: `docs/plans/2026-03-17-frontend-page-archetypes.md`

**Step 1: Run targeted verification**

Run:
```bash
shnote --what "执行前端回归验证" --why "在结束前确认 archetype 改造没有破坏现有前端质量基线" run "cd frontend && node --test src/lib/page-archetypes.test.ts src/components/threads-utils.test.ts src/lib/dashboard-chart-a11y.test.ts && npm run lint && npm run build"
```

Expected: all PASS

**Step 2: Update plan checkboxes / outcomes**

回填本设计稿与实施计划中的实际结果、已完成范围和残留问题。

**Step 3: Final review**

重点复核：
- `auth` 是否仍有模板感
- `workspace` 是否清楚表达主任务
- 移动端是否保留关键功能
- 是否引入新的 i18n / dark mode / a11y 倒退

**Step 4: Commit**

```bash
git add docs/plans/2026-03-17-frontend-page-archetypes-design.md docs/plans/2026-03-17-frontend-page-archetypes.md
git commit -m "docs(frontend): record page archetype rollout" -m "Capture the design and implementation notes for the first archetype migration batch."
```

## Implementation Outcome

- 已落地 `frontend/src/lib/page-archetypes.ts` 与 `frontend/src/lib/page-archetypes.test.ts`，把页面语义从“凭感觉设计”改成“有配置约束”。
- 已落地 `frontend/src/components/layout/page-archetypes.tsx`，作为后续 `dashboard / detail / settings` 收口的共享页面层。
- `auth` 已采用新的品牌舞台 + 表单面板结构；`admin` 与 `tenant` 入口共用同一 archetype。
- `ImportJobs` 已迁移到 `workspace` archetype，移除 hero 化表达，保留短页头、主任务面板和次级状态区。
- 最终验证通过：
  - `cd frontend && node --test src/lib/page-archetypes.test.ts src/components/threads-utils.test.ts src/lib/dashboard-chart-a11y.test.ts`
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`
- 已完成的人工视觉验证截图：
  - `/tmp/auth-archetype-admin-login.png`
  - `/tmp/auth-archetype-tenant-login.png`
  - `/tmp/workspace-archetype-imports-desktop.png`
  - `/tmp/workspace-archetype-imports-mobile.png`
