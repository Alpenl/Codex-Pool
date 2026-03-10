# Codex-Pool Logo Refresh Design

**Date:** 2026-03-07
**Status:** Approved

---

## Goal

将项目现有品牌入口从通用 `Box` 图标升级为真正的 Codex-Pool Logo 体系：

- `README` 使用用户提供的完整透明底 PNG Logo
- 前端侧边栏左上角使用适合小尺寸展示的扁平化品牌小图标
- 保持现有 UI 的克制、科技感和可读性，不让高复杂度 3D 细节污染 24px～32px 的导航位

## Context

当前项目中存在两个主要品牌入口：

1. `README.md` 中引用 `assets/logo.svg`
2. `frontend/src/components/layout/AppLayout.tsx` 左上角用 `lucide-react` 的 `Box` 作为临时品牌标识

用户提供了新的 4K 透明底 PNG：`/Users/wangnov/Downloads/Codex-Pool_logo.png`。
该图在文档展示中质量很好，但直接用于小尺寸导航图标会出现以下问题：

- 3D 金属高光在小尺寸下发糊
- 多层环绕结构在 24px 左右会丢失层次
- `>_` 中心识别点会被复杂质感削弱

## Chosen Direction

采用 `方案 A`：

- `README`：保留完整 Logo 视觉，使用优化后的 PNG 资源并放大展示
- `前端导航`：直接使用保留银色 3D 质感的原图 PNG，不再使用扁平化重绘图标

这是一个双资源方案：文档端与前端导航都使用同一视觉语言，但前端使用单独优化后的较小 PNG 资源，以避免把 4K 原图直接打进包体。

## Visual System

### 1. README Logo

- 使用透明底 PNG
- 控制文件体积，避免直接引用 4K 原图
- 保留原始银灰色 / 冷金属调性
- 居中展示，继续沿用当前 README 布局

### 2. Frontend 3D Mark

前端品牌图设计原则：

- 保留银色 3D 金属质感与透明底
- 不再压缩成过小的 24px 图标，而是提升到约 40px 展示
- 直接展示原图主体，不再做扁平化抽象
- 在深色与浅色主题下保持可读

### 3. Container Behavior

侧边栏原本有一个 `bg-primary` 的圆角方块承载 `Box` 图标。新方案改为移除该蓝色容器，直接显示更大的 3D PNG，原因是：

- 让银色 3D 质感完整保留
- 避免蓝色底板污染原图材质表现
- 更符合用户要求的“大一点”与“保留原图”

## Scope

### In scope

- 替换 `README` 展示 Logo
- 新增前端可复用品牌小图标组件或资源
- 替换 `AppLayout` 左上角 `Box` 图标
- 如有必要，为 README 新增优化后的 PNG 资源文件

### Out of scope

- 重新设计 favicon / PWA icon / app manifest
- 全站批量替换所有业务图标风格
- 为品牌系统新增完整设计规范页

## Implementation Notes

### Resource Strategy

建议新增：

- `assets/logo.png`：优化后的 README 展示图
- `frontend/src/assets/codex-pool-logo.png`：前端侧边栏使用的优化 3D PNG

前端不再使用 React SVG 小图标，而是直接引用优化后的 PNG。

### Frontend Integration

`AppLayout` 的品牌区域只替换图标，不改标题 `appName` 与周边交互逻辑。

### Accessibility

- `README` 图片保留 `alt="Codex-Pool Logo"`
- 前端品牌小图标作为装饰用途时可 `aria-hidden`

## Validation

- `README` 图片能正确展示
- 前端构建通过
- 侧边栏在折叠 / 展开、浅色 / 深色主题下图标仍清晰
- 新 Logo 不造成布局抖动或明显视觉失衡

## Risks

- 如果 README 直接引用过大的 PNG，会让仓库文档加载变慢
- 如果前端小图标过于贴近原图复杂结构，小尺寸可读性会下降

## Recommendation

先交付最小可用版本：

1. 生成 README 用优化 PNG
2. 交付扁平化 `single-ring + >_` 小图标
3. 替换现有 `Box`
4. 通过构建验证

后续如果你觉得过于“平”，再基于这版迭代成“折中金属感”版本。


## Iteration: Sidebar Brand Polish

- 侧边栏 Logo 放大到约 56px
- 品牌区改为左对齐
- `Codex Pool` 标题采用枪灰色到银色的金属渐变
- 仅调整 `frontend/src/components/layout/AppLayout.tsx`，不改 README 与其他品牌位
