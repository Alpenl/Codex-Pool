# Sidebar Bottom Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将桌面端 sidebar 折叠按钮从品牌 header 挪到底部状态区，消除对品牌标题的遮挡。

**Architecture:** 只改 `AppLayout`。移除 header 里的桌面折叠按钮，释放品牌 header 可用宽度；然后在底部状态区增加同功能的桌面折叠按钮，并保留当前版本号和在线状态信息。

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite

---

### Task 1: 清理 header 内的桌面折叠按钮

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`

### Task 2: 在底部状态区接入桌面折叠按钮

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`

### Task 3: 验证

**Files:**
- Verify: `frontend/src/components/layout/AppLayout.tsx`

Run: `cd frontend && npm run build`
Run: `cd frontend && npm run lint`
