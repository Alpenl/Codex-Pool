# Codex-Pool Logo Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用用户提供的新 Logo 替换项目中的临时品牌入口：README 使用完整 Logo，前端侧边栏改成更大的 3D PNG 原图。

**Architecture:** 保持品牌资源分层：文档端使用优化后的 PNG 展示完整 Logo，前端导航使用单独优化的 3D PNG 资源，避免把 4K 原图直接打进前端包体。实现上只改品牌入口资源与布局接线，不扩散到业务页面。

**Tech Stack:** Markdown, PNG asset optimization, React, TypeScript, Vite

---

### Task 1: 准备品牌资源

**Files:**
- Create: `assets/logo.png`
- Create: `frontend/src/assets/codex-pool-logo.png`
- Source: `/Users/wangnov/Downloads/Codex-Pool_logo.png`

**Step 1: 生成 README 展示资源**

- 从用户提供的 PNG 生成一份适合仓库展示的优化版本
- 保留透明底，压缩到合理体积

**Step 2: 生成前端 3D PNG 资源**

- 从用户提供的原图生成前端可用的优化 PNG
- 保留透明底与银色 3D 质感
- 控制资源体积，适合 Vite 打包

**Step 3: 验证资源存在**

Run: `ls -l assets/logo.png frontend/src/assets/codex-pool-logo.png`
Expected: 两个文件都存在

### Task 2: 接入 README 和前端侧边栏

**Files:**
- Modify: `README.md`
- Modify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 替换 README 资源引用**

- 保持现有文档结构不变
- 将图片引用从 `assets/logo.svg` 切换到新的 PNG 资源

**Step 2: 替换侧边栏临时 Box 图标**

- 移除左上角品牌位对扁平化 SVG 的依赖
- 接入 3D PNG 原图资源
- 放大品牌位尺寸，并移除会影响原图质感的蓝色底板

**Step 3: 自检 i18n / 结构影响**

- 不引入新的用户可见文案
- 不改导航信息结构

### Task 3: 验证与收尾

**Files:**
- Verify: `README.md`
- Verify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 运行前端构建验证**

Run: `cd frontend && npm run build`
Expected: 构建通过，无类型错误

**Step 2: 检查改动摘要**

Run: `git diff -- README.md frontend/src/components/layout/AppLayout.tsx frontend/src/assets/codex-pool-logo.png assets/logo.png`
Expected: 仅包含品牌资源与接线改动

**Step 3: 人工视觉检查**

- 确认 README Logo 显示正常
- 确认侧边栏品牌图标在展开/折叠状态都可识别


## Iteration: Sidebar Brand Polish

- 侧边栏 Logo 放大到约 56px
- 品牌区改为左对齐
- `Codex Pool` 标题采用枪灰色到银色的金属渐变
- 仅调整 `frontend/src/components/layout/AppLayout.tsx`，不改 README 与其他品牌位
