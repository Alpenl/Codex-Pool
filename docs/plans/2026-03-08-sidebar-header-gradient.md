# Sidebar Header Gradient Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 缩小 sidebar header 的品牌标题并加入渐变背景，让 Logo 与标题在深浅色模式下更协调且不再遮挡。

**Architecture:** 只修改 `AppLayout` 的品牌 header 区。通过调整品牌组的 flex 宽度分配、降低标题字号、为 header 增加主题化渐变底层和细微高光，解决空间与层次问题，同时保持现有 Logo 资源与交互结构不变。

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite

---

### Task 1: 调整品牌内容布局

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 缩小标题尺寸**

- 将 `Codex Pool` 标题从当前较大的展示尺寸收窄到更适合侧边栏宽度的字号
- 保留现有金属渐变风格

**Step 2: 修正宽度分配**

- 让品牌内容容器获得 `flex-1` 和 `min-w-0`
- 让标题本身也具备可收缩能力，避免被右侧按钮遮挡

### Task 2: 加入 header 渐变背景

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 增加主题化背景层**

- 给 header 增加浅色/深色不同的金属渐变背景
- 保持边框与现有层级结构

**Step 2: 增加细微高光/氛围层**

- 使用极轻的高光或径向层次增强整体承托感
- 避免强发光和过重磨砂感

### Task 3: 验证

**Files:**
- Verify: `frontend/src/components/layout/AppLayout.tsx`

**Step 1: 运行构建**

Run: `cd frontend && npm run build`
Expected: 构建通过

**Step 2: 运行 lint**

Run: `cd frontend && npm run lint`
Expected: lint 通过
