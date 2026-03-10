# Sidebar Header Plate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 sidebar 左上角品牌位重构成更完整的金属铭牌式 header，让 Logo 成为主角、标题完整显示、折叠按钮弱化。

**Architecture:** 仅修改 `AppLayout` 的品牌 header 区域。通过重排品牌组和按钮层级、重新分配宽度、收窄标题字号，并为 header 增加更完整的金属渐变底板、高光和阴影，提升品牌完成度而不扩大改动范围。

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite

---

### Task 1: 调整品牌层级与宽度分配

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 收窄标题但保留完整显示**
- 降低标题字号与追踪值
- 避免再使用易导致品牌名被截断的布局分配

**Step 2: 弱化折叠按钮存在感**
- 保持按钮可用
- 但让其在视觉上退后于 Logo 和标题

### Task 2: 做成金属铭牌式 header

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 重做背景底板**
- 使用更完整的金属渐变背景
- 增加顶部高光和底部阴影

**Step 2: 保持 Logo 与标题统一材质语言**
- 让现有 3D Logo、标题渐变、header 背景风格统一
- 不引入过强 glow 或额外颜色

### Task 3: 验证

**Files:**
- Verify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 运行构建**
Run: `cd frontend && npm run build`
Expected: 构建通过

**Step 2: 运行 lint**
Run: `cd frontend && npm run lint`
Expected: lint 通过
