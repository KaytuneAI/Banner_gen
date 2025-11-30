# FluidDAM - Banner 批量生成工具 (Phase 1)

Banner 批量生成工具，支持通过 JSON 数据和图片文件批量生成 Banner PNG。

## 功能特性

- ✅ 上传 JSON 数据文件（包含多条 Banner 数据）
- ✅ 上传多张图片文件（产品图等）
- ✅ **支持自定义 HTML/CSS 模板**
- ✅ 实时预览 Banner 效果
- ✅ 一键批量生成所有 Banner PNG
- ✅ 支持预览切换（上一条/下一条）

## 技术栈

- React 18 + TypeScript
- Vite
- html-to-image（前端 PNG 导出）
- React Router

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173/banner-batch`

### 构建生产版本

```bash
npm run build
```

## 使用方法

1. **上传 JSON 数据文件**
   - 点击"上传 JSON 数据"
   - 选择包含 `BannerFields` 数组的 JSON 文件
   - 参考 `example-data.json` 格式

2. **上传图片文件**
   - 点击"上传图片文件"
   - 选择多张图片（支持多选）
   - 图片文件名需与 JSON 中的 `product_image` 字段对应

3. **选择模板（可选）**
   - 在左侧预览区域下方，点击"上传 HTML"和"上传 CSS"按钮
   - 上传自定义的 HTML 和 CSS 模板文件
   - 在 HTML 中使用 `{{字段名}}` 作为占位符
   - 支持的占位符：`{{id}}`, `{{activity_name}}`, `{{main_title}}`, `{{promo_text}}`, `{{price}}`, `{{price_extra}}`, `{{product_image}}`
   - 参考 `example-template.html` 和 `example-template.css`
   - 如果不上传模板，将使用默认的 Dove750x400 模板

4. **预览 Banner**
   - 左侧实时显示当前选中的 Banner 预览
   - 使用"上一条"/"下一条"按钮切换预览

5. **批量生成**
   - 点击"一键生成所有 Banner"按钮
   - 浏览器会自动下载所有生成的 PNG 文件

## JSON 数据格式

```json
[
  {
    "id": "dove_01",
    "activity_name": "大牌礼遇日",
    "main_title": "大师奢香 一洗顺滑",
    "promo_text": "第2件半价，叠券再减40元",
    "price": "89.9",
    "price_extra": "日常价¥129，活动时间 11.27-11.30",
    "product_image": "img_001.png"
  }
]
```

### 字段说明

- `id` (必需): 用于命名输出文件，建议唯一
- `activity_name` (必需): 活动名称
- `main_title` (必需): 主标题
- `promo_text` (必需): 促销文案
- `price` (必需): 价格
- `price_extra` (可选): 原价/小字说明
- `product_image` (必需): 产品图片文件名（需与上传的图片文件名对应）

## 项目结构

```
src/
  pages/
    BannerBatchPage/        # 主页面
      BannerBatchPage.tsx
      BannerBatchPage.css
  components/
    banners/
      Dove750x400/          # Banner 模板组件
        Dove750x400.tsx
        Dove750x400.css
    templates/
      CustomTemplate.tsx     # 自定义模板渲染组件
  utils/
    htmlExport.ts           # PNG 导出工具
    fileHelpers.ts          # 文件处理工具
  types/
    index.ts                # 类型定义
```

## 自定义模板使用

### HTML 模板占位符

在 HTML 文件中使用 `{{字段名}}` 作为占位符，系统会自动替换为 JSON 数据中的对应值：

- `{{id}}` - Banner ID
- `{{activity_name}}` - 活动名称
- `{{main_title}}` - 主标题
- `{{promo_text}}` - 促销文案
- `{{price}}` - 价格
- `{{price_extra}}` - 价格额外说明（可选）
- `{{product_image}}` - 产品图片 URL（会自动映射到上传的图片）

### 示例模板

参考项目根目录下的 `example-template.html` 和 `example-template.css` 文件。

### 模板要求

- HTML 文件应包含完整的 DOM 结构
- CSS 文件应包含所有样式定义
- 建议设置固定的宽高（如 750x400px），确保导出尺寸一致
- 图片路径使用 `{{product_image}}` 占位符，系统会自动替换为实际图片 URL

## 注意事项

- 图片文件名需与 JSON 中的 `product_image` 字段完全匹配
- 批量生成时，浏览器可能会提示下载多个文件，请允许下载
- 建议使用 Chrome 或 Edge 浏览器以获得最佳体验
- 导出的 PNG 图片分辨率为 2x（1500x800px），确保清晰度
- 自定义模板中的图片路径必须使用 `{{product_image}}` 占位符，不能使用相对路径

## Phase 2 扩展预留

- 支持多个模板选择
- 后端渲染支持（node-html-to-image）
- PSD 自动解析
- Excel 直接导入

