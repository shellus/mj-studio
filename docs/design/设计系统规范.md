# UI 设计系统

本项目基于 **Fluent 2** 设计理念，追求轻盈、现代、系统感的视觉风格。

提示词来自：https://www.uiprompt.site/zh/styles

## 设计理念

### 核心特征

- **柔和渐变背景** + **亚克力玻璃卡片** + **清晰轮廓与圆角系统**
- 减少多余装饰，强调几何简洁和舒适的层次结构
- 营造温和、友好、现代而不过分张扬的气质

### 材质与质感

- **亚克力效果**：半透明、略微模糊、带有一定饱和度和光泽
- 卡片背景使用高透明度浅色叠加模糊滤镜
- 边缘带高光或柔和渐变，模拟光线折射

## 具体规范

### 颜色

使用 Nuxt UI 主题变量，确保深色模式兼容：

| 用途 | CSS 变量 | 说明 |
|-----|---------|------|
| 主色 | `--ui-primary` | 紫色系 (violet)，用于按钮、链接、强调元素 |
| 文字 | `--ui-text`、`--ui-text-muted`、`--ui-text-dimmed` | 主文字、次要文字、禁用文字 |
| 背景 | `--ui-bg`、`--ui-bg-elevated`、`--ui-bg-muted` | 页面背景、卡片背景、输入框背景 |
| 边框 | `--ui-border`、`--ui-border-muted` | 分割线、输入框边框 |

**使用方式**：
```html
<p class="text-(--ui-text-muted)">次要文字</p>
<div class="bg-(--ui-bg-elevated)">卡片</div>
```

### 圆角

| 元素 | Tailwind 类 | 像素值 |
|-----|------------|-------|
| 卡片、模态框 | `rounded-lg` | 8px |
| 按钮、输入框 | `rounded-md` | 6px |
| 小元素（标签、徽章） | `rounded` | 4px |
| 头像、图标按钮 | `rounded-full` | 圆形 |

### 间距

遵循 4px 基准网格，常用值：

| 场景 | Tailwind 类 | 像素值 |
|-----|------------|-------|
| 紧凑间距 | `gap-1`、`p-1` | 4px |
| 元素内间距 | `gap-2`、`p-2` | 8px |
| 组件间距 | `gap-3`、`p-3` | 12px |
| 区块间距 | `gap-4`、`p-4` | 16px |
| 页面边距 | `gap-6`、`p-6` | 24px |

### 动效

| 属性 | 值 | 说明 |
|-----|---|------|
| 时长 | 150-300ms | 快速但不生硬 |
| 缓动 | `ease-out` | 符合 Fluent 标准 |
| Hover 效果 | 颜色加深、阴影增强 | 轻微变化，不夸张 |

**Tailwind 类**：
```html
<div class="transition-all duration-200 ease-out hover:shadow-lg">
  悬停效果
</div>
```

### 阴影

| 层级 | Tailwind 类 | 使用场景 |
|-----|------------|---------|
| 无阴影 | - | 内嵌元素 |
| 轻微 | `shadow-sm` | 卡片默认状态 |
| 中等 | `shadow` | 下拉菜单、悬停状态 |
| 明显 | `shadow-lg` | 模态框、弹出层 |

### 亚克力效果

用于需要突出层次感的卡片：

```html
<div class="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border border-white/20">
  亚克力卡片
</div>
```

## 组件使用规范

### 表单

必须使用 `UForm` + `UFormField` 组合：

```vue
<UForm :state="form">
  <UFormField label="名称" name="name">
    <UInput v-model="form.name" />
  </UFormField>
</UForm>
```

### 按钮

优先使用组件 props 而非自定义样式：

```vue
<!-- ✅ 正确 -->
<UButton color="primary" variant="solid">主要按钮</UButton>
<UButton color="neutral" variant="ghost">次要按钮</UButton>

<!-- ❌ 避免 -->
<UButton class="bg-blue-500 text-white">自定义样式</UButton>
```

### 模态框

通过 `:ui` 属性调整宽度：

```vue
<UModal :ui="{ width: 'sm:max-w-2xl' }">
  <template #header>标题</template>
  <template #body>内容</template>
</UModal>
```

## 响应式设计

采用**移动端优先**策略：

```html
<!-- 移动端默认单列，桌面端两列 -->
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
```

断点参考：
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

## 参考资源

- [Nuxt UI 组件文档](https://ui.nuxt.com/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [Fluent 2 设计系统](https://fluent2.microsoft.design/)
