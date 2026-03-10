# Sidebar Header Plate Design

**Date:** 2026-03-08
**Status:** Approved

---

## Goal

把 sidebar 左上角品牌位做成更完整的“金属铭牌式 header”，解决标题被截断和 header 承托不足的问题。

## Chosen Direction

- Logo 继续作为主视觉，不再继续放大
- `Codex Pool` 标题缩小一档，但保证完整显示
- 折叠按钮弱化，作为辅助控件退到右侧
- 整个 header 使用金属渐变底板、高光和阴影形成完整承托层

## Visual Notes

- header 背景采用深石墨 → 枪灰 → 淡银灰的金属渐变
- 增加顶部轻高光和底部轻阴影，形成“铭牌”感觉
- 标题使用更克制的金属文字，不再与按钮争夺空间
- 品牌组与按钮分离，层级更明确

## Scope

- 只修改 `frontend/src/components/layout/AppLayout.tsx`
- 不改 README
- 不改 Logo 资源
- 不改 i18n 文案内容
