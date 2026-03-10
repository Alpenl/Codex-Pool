# Sidebar Header Gradient Design

**Date:** 2026-03-08
**Status:** Approved

---

## Goal

解决侧边栏品牌位当前两个问题：

- `Codex Pool` 因可用宽度不足而被遮挡
- header 缺少承托 Logo 与金属标题的整体背景层次

## Chosen Direction

- 缩小 `Codex Pool` 标题字号，并让其在品牌行内更安全地参与宽度分配
- 为 sidebar header 增加低饱和、金属感的渐变背景
- 保持当前 3D Logo、弱环境光与金属文字风格，不引入新的强视觉元素

## Visual Notes

- 标题从当前偏大的展示尺寸回收到更稳的 `14px~15px`
- 品牌内容容器使用 `flex-1` + `min-w-0`，确保标题在右侧控制按钮存在时仍能正常收缩
- header 背景采用深石墨 → 枪灰 → 轻银灰的渐变，浅色模式更亮、深色模式更克制
- 渐变背景只做承托，不抢 Logo 和标题主体

## Scope

- 修改 `frontend/src/components/layout/AppLayout.tsx`
- 不改 README
- 不改 Logo 资源
- 不改 i18n 文案内容
