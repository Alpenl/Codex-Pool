# Frontend Redesign Baseline Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用新的“器物感静奢·工作台版”设计基线替换现有前端的 AI 模板式视觉语言，并完成首批关键页面重做。

**Architecture:** 先从纯配置和共享壳层入手，删除会向整站扩散的背景、材质、排版和控件信号，再逐页重做 login、dashboard、workspace/settings 样板页。每一批都优先通过纯函数测试固定设计契约，再用 lint、build 和浏览器截图验证真实观感。

**Tech Stack:** React 19、TypeScript、Tailwind v4、Framer Motion、shadcn/ui、Node `--test`、Vite、agent-browser

---

### Task 1: 重定义设计语言配置

**Files:**
- Modify: `frontend/src/lib/design-system.ts`
- Modify: `frontend/src/lib/design-system.test.ts`

**Step 1: Write the failing test**

在 `frontend/src/lib/design-system.test.ts` 中先把旧基线的矿物青绿和大圆角契约改掉，新增断言：

- `resolveDesignLanguage()` 的强调色族从 `mineral-teal` 改为更中性的器物系强调色
- `radius.panel` 与 `radius.stage` 收小一档
- `resolveSurfaceRecipe('stage')` 不再返回 `glow-edge` / `atmospheric`
- `resolveSurfaceRecipe('sidebar')` 不再返回 `chrome`

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行新的设计语言测试" --why "先固定去 AI 模板的新设计契约" run "cd frontend && node --test src/lib/design-system.test.ts"
```

Expected: FAIL，因为当前设计语言仍是上一版材质和色彩设定。

**Step 3: Write minimal implementation**

在 `frontend/src/lib/design-system.ts` 中最小实现新基线：

- 收敛 palette family 与 surface recipe 命名
- 将 stage / panel / sidebar 的语义改成安静器件表面
- 收小圆角与阴影层级

**Step 4: Run test to verify it passes**

Run:
```bash
shnote --what "验证新的设计语言配置" --why "确认基线契约已经切换到新的器物感方向" run "cd frontend && node --test src/lib/design-system.test.ts"
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/design-system.ts frontend/src/lib/design-system.test.ts
git commit -m "feat(frontend): reset redesign design language" -m "Replace the previous mineral-glass baseline with a quieter object-like design language."
```

### Task 2: 移除全局 AI 模板背景语言

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/ui/parallax-background.tsx`

**Step 1: Write the failing test**

在 `frontend/src/lib/design-system.test.ts` 中增加描述性断言：

- `stage` 和 `panel` 都不再依赖 glow/glass/chrome 型 recipe 名称
- `canvasTone` 的 light / dark 表达偏向 `paper` / `ink` 一类更安静的基调

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行背景基线测试" --why "先把全局背景和材质的旧语言锁定为失败" run "cd frontend && node --test src/lib/design-system.test.ts"
```

Expected: FAIL

**Step 3: Write minimal implementation**

最小实现包括：

- 在 `frontend/src/index.css` 中删除 `page-grid-wash`、重写 `page-stage-surface / page-panel-surface / page-panel-surface-muted`
- 在 `frontend/src/components/ui/parallax-background.tsx` 中移除鼠标跟随、光斑、彩色 blur 和显性网格，改成静态、低噪声的矿物纸感背景

**Step 4: Run checks**

Run:
```bash
shnote --what "验证全局背景语言" --why "确认背景和材质重写后前端仍可正常构建" run "cd frontend && node --test src/lib/design-system.test.ts && npm run lint && npm run build"
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/components/ui/parallax-background.tsx frontend/src/lib/design-system.test.ts
git commit -m "feat(frontend): replace redesign background language" -m "Remove glow-heavy parallax surfaces and switch the app canvas to a quieter material backdrop."
```

### Task 3: 重写共享壳层和页面表面层级

**Files:**
- Modify: `frontend/src/lib/page-archetypes.ts`
- Modify: `frontend/src/lib/page-archetypes.test.ts`
- Modify: `frontend/src/components/layout/page-archetypes.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: Write the failing test**

在 `frontend/src/lib/page-archetypes.test.ts` 中新增或改写断言：

- `auth` 的 `effectProfile` 不再是 `subtle` 品牌舞台语气，而是更克制的器件语气
- `dashboard` 允许轻微作者性但不再依赖强调表面
- `workspace` 与 `settings` 明确落在 quieter surface tone

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行页面分型测试" --why "先固定新基线下的页面表面纪律" run "cd frontend && node --test src/lib/page-archetypes.test.ts"
```

Expected: FAIL

**Step 3: Write minimal implementation**

最小实现包括：

- `frontend/src/lib/page-archetypes.ts` 中重新定义 archetype 的 surface tone / effect profile
- `frontend/src/components/layout/page-archetypes.tsx` 中去掉大写 eyebrow、强 glow card、过大标题姿态和过度圆角
- `frontend/src/components/layout/AppLayout.tsx` 中收敛 sidebar header、logo halo、导航项 hover、顶部工具按钮的材质与边界

**Step 4: Run checks**

Run:
```bash
shnote --what "验证共享壳层与页面表面" --why "确认新的页面表面纪律不破坏构建和测试" run "cd frontend && node --test src/lib/page-archetypes.test.ts && npm run lint && npm run build"
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/page-archetypes.ts frontend/src/lib/page-archetypes.test.ts frontend/src/components/layout/page-archetypes.tsx frontend/src/components/layout/AppLayout.tsx
git commit -m "feat(frontend): recast shared shell surfaces" -m "Tone down the shared shell, navigation, and archetype surfaces to match the new design baseline."
```

### Task 4: 重做 auth shell 和登录页

**Files:**
- Modify: `frontend/src/components/auth/auth-shell.tsx`
- Modify: `frontend/src/pages/Login.tsx`
- Reference: `frontend/src/components/layout/page-archetypes.tsx`
- Reference: `frontend/src/components/ui/button.tsx`
- Reference: `frontend/src/components/ui/input.tsx`

**Step 1: Write the failing test**

在 `frontend/src/lib/page-archetypes.test.ts` 中补一条断言：

- `auth` 页的 stage emphasis 允许比 workspace 更高，但仍然是 `controlled` 而非 `branded-stage`

如果需要，为 `frontend/src/lib/page-archetypes.ts` 新增更精确的枚举值并让测试先失败。

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行 auth 基线测试" --why "先固定登录页的新语气约束" run "cd frontend && node --test src/lib/page-archetypes.test.ts"
```

Expected: FAIL

**Step 3: Write minimal implementation**

最小实现包括：

- `frontend/src/components/auth/auth-shell.tsx` 中取消模板化双栏舞台表达，弱化 bullet 列表和品牌大面板
- `frontend/src/pages/Login.tsx` 中让表单重新成为第一视觉锚点，收敛标题姿态和说明文案的展示方式

**Step 4: Run checks and capture screenshots**

Run:
```bash
shnote --what "验证登录页重做" --why "确认 auth 入口在新基线下能正常工作并可截图校验" run "cd frontend && npm run lint && npm run build"
```

Run:
```bash
shnote --what "抓取登录页截图" --why "用真实页面验证登录页是否摆脱模板化舞台感" run "agent-browser --session-name codex-redesign open http://127.0.0.1:5174/ && agent-browser --session-name codex-redesign wait --load networkidle && agent-browser --session-name codex-redesign wait 1500 && agent-browser --session-name codex-redesign screenshot /tmp/codex-login-reset.jpg"
```

Expected: PASS，且截图中表单主次更清楚、装饰明显减少。

**Step 5: Commit**

```bash
git add frontend/src/components/auth/auth-shell.tsx frontend/src/pages/Login.tsx frontend/src/lib/page-archetypes.ts frontend/src/lib/page-archetypes.test.ts
git commit -m "feat(frontend): redesign auth entry baseline" -m "Make the login experience quieter and more product-like under the reset design direction."
```

### Task 5: 重做 dashboard 首屏

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/components/layout/page-archetypes.tsx`
- Reference: `frontend/src/components/ui/button.tsx`
- Reference: `frontend/src/components/ui/card.tsx`

**Step 1: Identify the failing contract**

在 `frontend/src/lib/page-archetypes.test.ts` 中增加断言：

- `dashboard` 可以保留轻微作者性，但 surface emphasis 必须低于旧版 `stage`
- `dashboard` 的 rail 和 KPI card 应比 `auth` 更安静

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行 dashboard 表面测试" --why "先固定概览页应有的克制层级" run "cd frontend && node --test src/lib/page-archetypes.test.ts"
```

Expected: FAIL

**Step 3: Write minimal implementation**

最小实现包括：

- 重做 dashboard 页头，取消显性大舞台感
- 重做 KPI 卡片和操作按钮，让它们更像概览器件而不是浮卡
- 收紧按钮排列和说明文案节奏

**Step 4: Run checks and capture screenshots**

Run:
```bash
shnote --what "验证 dashboard 重做" --why "确认概览页视觉收敛后仍能通过构建" run "cd frontend && node --test src/lib/page-archetypes.test.ts && npm run lint && npm run build"
```

Run:
```bash
shnote --what "抓取 dashboard 截图" --why "校验 dashboard 是否变得更成熟而不再像模板卡片首页" run "agent-browser --session-name codex-redesign open http://127.0.0.1:5174/dashboard && agent-browser --session-name codex-redesign wait --load networkidle && agent-browser --session-name codex-redesign wait 3000 && agent-browser --session-name codex-redesign screenshot /tmp/codex-dashboard-reset.jpg"
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.tsx frontend/src/components/layout/page-archetypes.tsx frontend/src/lib/page-archetypes.ts frontend/src/lib/page-archetypes.test.ts
git commit -m "feat(frontend): redesign dashboard overview surfaces" -m "Rework dashboard hero and KPI surfaces to fit the quieter object-like baseline."
```

### Task 6: 收敛 workspace / settings 的任务表面

**Files:**
- Modify: `frontend/src/pages/ImportJobs.tsx`
- Modify: `frontend/src/pages/Models.tsx`
- Modify: `frontend/src/pages/Config.tsx`
- Modify: `frontend/src/components/ui/button.tsx`
- Modify: `frontend/src/components/ui/input.tsx`
- Modify: `frontend/src/components/ui/textarea.tsx`
- Modify: `frontend/src/components/ui/select.tsx`
- Modify: `frontend/src/components/ui/card.tsx`
- Modify: `frontend/src/components/ui/standard-data-table.tsx`

**Step 1: Write the failing test**

在 `frontend/src/lib/design-system.test.ts` 中增加断言：

- outline / ghost 控件进一步弱化表演性
- table toolbar / header / row surface 更偏扫描效率，不再强调漂浮与渐变

**Step 2: Run test to verify it fails**

Run:
```bash
shnote --what "运行控件与表格基线测试" --why "先把任务型页面需要的降噪控件契约固定下来" run "cd frontend && node --test src/lib/design-system.test.ts"
```

Expected: FAIL

**Step 3: Write minimal implementation**

最小实现包括：

- 重写基础控件的边界、hover、focus 和圆角
- 降低 `StandardDataTable` 的包装感，让其更像高频工作台表格
- 在 `ImportJobs`、`Models`、`Config` 中清除过强的卡片感和标题姿态，重新建立主任务优先级

**Step 4: Run checks and capture screenshots**

Run:
```bash
shnote --what "验证任务页与设置页重做" --why "确认 workspace 和 settings 页面降噪后仍然稳定" run "cd frontend && node --test src/lib/design-system.test.ts && npm run lint && npm run build"
```

Run:
```bash
shnote --what "抓取导入页截图" --why "检查主任务区是否已经成为唯一视觉锚点" run "agent-browser --session-name codex-redesign open http://127.0.0.1:5174/import-jobs && agent-browser --session-name codex-redesign wait --load networkidle && agent-browser --session-name codex-redesign wait 3000 && agent-browser --session-name codex-redesign screenshot /tmp/codex-import-reset.jpg"
```

Run:
```bash
shnote --what "抓取配置页截图" --why "检查设置页是否已经足够安静稳定" run "agent-browser --session-name codex-redesign open http://127.0.0.1:5174/config && agent-browser --session-name codex-redesign wait --load networkidle && agent-browser --session-name codex-redesign wait 3000 && agent-browser --session-name codex-redesign screenshot /tmp/codex-config-reset.jpg"
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/ImportJobs.tsx frontend/src/pages/Models.tsx frontend/src/pages/Config.tsx frontend/src/components/ui/button.tsx frontend/src/components/ui/input.tsx frontend/src/components/ui/textarea.tsx frontend/src/components/ui/select.tsx frontend/src/components/ui/card.tsx frontend/src/components/ui/standard-data-table.tsx frontend/src/lib/design-system.ts frontend/src/lib/design-system.test.ts
git commit -m "feat(frontend): tone down workspace task surfaces" -m "Reduce template-like chrome across task pages, forms, and data tables."
```

### Task 7: 回填文档并做最终验证

**Files:**
- Modify: `docs/plans/2026-03-18-frontend-redesign-baseline-reset.md`
- Modify: `docs/plans/2026-03-18-frontend-redesign-baseline-reset-design.md`

**Step 1: Update the plan checklist**

把已完成任务在本计划中标注完成状态，并记录最终截图检查结论。

**Step 2: Run final checks**

Run:
```bash
shnote --what "运行最终前端验证" --why "在提交收尾前确认新的设计基线可以稳定通过检查" run "cd frontend && node --test src/lib/design-system.test.ts && node --test src/lib/page-archetypes.test.ts && node --test src/lib/motion-presets.test.ts && npm run lint && npm run build"
```

Expected: PASS

**Step 3: Commit**

```bash
git add docs/plans/2026-03-18-frontend-redesign-baseline-reset.md docs/plans/2026-03-18-frontend-redesign-baseline-reset-design.md
git commit -m "docs(frontend): finalize redesign reset rollout" -m "Record the reset baseline execution and close out the first rollout batch."
```
