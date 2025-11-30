# FluidDAM - Banner 批量生成工具 (Phase 1)

Banner 批量生成工具，支持通过 HTML/CSS 模板和 JSON 数据批量生成 Banner PNG。

## 功能特性

- ✅ **自定义 HTML/CSS 模板上传**（支持内联 CSS 自动提取）
- ✅ **动态字段解析**（自动识别 `data-field` 和 `data-label` 属性）
- ✅ **交互式字段编辑**（WYSIWYG 实时预览）
- ✅ **点击预览区域上传**（便捷的文件上传方式）
- ✅ **JSON 数据批量导入**（支持多条 Banner 数据）
- ✅ **实时预览 Banner 效果**（支持上一条/下一条切换）
- ✅ **编辑值自动保存**（切换数据时保留手动编辑的内容）
- ✅ **一键批量生成**（自动打包为 ZIP 文件）
- ✅ **时间戳文件名**（自动添加生成时间到文件名）

## 技术栈

- React 18 + TypeScript
- Vite
- html-to-image（前端 PNG 导出）
- JSZip（ZIP 文件打包）
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

### 1. 上传 HTML/CSS 模板

**方式一：点击预览区域上传**
- 在左侧预览区域（空白时）点击任意位置
- 选择 HTML 文件上传

**方式二：使用上传按钮**
- 在左下角"选择模板"区域，点击"上传 HTML"按钮
- HTML 文件为必需，CSS 文件为可选

**自动功能：**
- 系统会自动提取 HTML 中的 `<style>` 标签内容
- 系统会自动识别 `<link rel="stylesheet">` 标签（通过 `<base>` 标签自动加载）
- 如果 HTML 中包含内联 CSS，无需单独上传 CSS 文件

### 2. 上传 JSON 数据文件

- 在右侧控制面板，点击"上传 JSON 数据"
- 选择包含 Banner 数据数组的 JSON 文件
- 参考 `public/banner_demo/test.json` 格式

### 3. 编辑字段内容

**自动字段识别：**
- 系统会自动解析 HTML 模板中的 `data-field` 属性
- 所有可编辑字段会显示在右侧"本模板可编辑字段"列表中

**交互式编辑：**
- 点击字段名称，下方会显示当前值
- 可以直接编辑字段内容，实时预览效果
- 编辑的值会自动保存，切换数据时不会丢失

**字段高亮：**
- 点击字段时，预览区域会高亮显示对应的元素
- 方便定位和编辑

### 4. 预览和切换

- 左侧实时显示当前 Banner 预览
- 使用"上一条"/"下一条"按钮切换数据
- 手动编辑的内容会自动保存和恢复

### 5. 批量生成

- 点击"一键生成所有 Banner"按钮
- 系统会自动生成所有 Banner 的 PNG 图片
- 所有图片会打包为一个 ZIP 文件下载
- 文件名格式：`{id}_{YYYYMMDDHHmm}.png`
- ZIP 文件名格式：`banners_{YYYYMMDDHHmm}.zip`

## HTML 模板规范

### 字段标记

使用 `data-field` 属性标记可编辑字段：

```html
<!-- 文本字段 -->
<p data-field="main_title" data-label="主标题">默认文本</p>

<!-- 图片字段 -->
<img data-field="product_image" src="placeholder.jpg" alt="产品图" />

<!-- 价格字段（特殊结构） -->
<p class="price" 
   data-field-int="sec_price_int" 
   data-field-decimal="sec_price_decimal">
  <span class="sign">￥</span>29<span class="decimal">.9</span>
</p>
```

### 字段属性说明

- `data-field`: 字段名称（对应 JSON 数据中的键名）
- `data-label`: 字段标签（可选，用于显示友好的名称）
- `data-field-int`: 价格整数部分字段名（用于价格字段）
- `data-field-decimal`: 价格小数部分字段名（用于价格字段）

### CSS 路径处理

- 使用相对路径的图片和 CSS 文件会自动映射到 `public/banner_demo/` 目录
- 系统会在 iframe 中注入 `<base href="/banner_demo/">` 标签
- 确保图片和 CSS 文件放在 `public/banner_demo/` 目录下

### 示例模板

参考 `public/banner_demo/test.html` 和 `public/banner_demo/style.css`

## JSON 数据格式

```json
[
  {
    "id": "banner_001",
    "main_title": "限时直降 洁面优选!",
    "sales_point": "限时直降 洁面优选!",
    "sec_price_int": "29",
    "sec_price_decimal": "9",
    "product_image": "image/product.png"
  }
]
```

### 字段说明

- `id` (可选): 用于命名输出文件，如果不提供则使用索引
- 其他字段: 根据 HTML 模板中的 `data-field` 属性定义
- 字段名必须与 HTML 模板中的 `data-field` 值完全匹配

## 项目结构

```
src/
  pages/
    BannerBatchPage/              # 主页面
      BannerBatchPage.tsx         # 主组件逻辑
      BannerBatchPage.css         # 页面样式
  utils/
    htmlExport.ts                 # PNG 导出工具
    fileHelpers.ts                # 文件处理工具
  types/
    index.ts                      # 类型定义

public/
  banner_demo/                    # 模板资源目录
    test.html                     # 示例 HTML 模板
    style.css                     # 示例 CSS 样式
    test.json                     # 示例 JSON 数据
    image/                        # 图片资源目录
```

## 核心功能说明

### 1. 模板字段自动解析

系统使用 `DOMParser` 解析上传的 HTML 文件，自动识别所有带有 `data-field` 属性的元素，并提取字段信息。

### 2. WYSIWYG 编辑

- 点击字段时，系统会在 iframe 中高亮对应元素
- 编辑输入框会显示当前值
- 修改内容会实时更新到预览区域
- 所有编辑会自动保存到 `editedValues` 状态中

### 3. 价格字段特殊处理

价格字段使用特殊的 DOM 结构（整数部分为文本节点，小数部分为 `.decimal` span），系统提供了专门的 `updatePriceFields` 函数来处理。

### 4. 批量生成流程

1. 遍历所有 JSON 数据条目
2. 应用数据和编辑值到 iframe
3. 等待渲染完成
4. 导出 `.container` 元素（或 `body`）为 PNG
5. 将所有 PNG 打包为 ZIP 文件
6. 自动下载 ZIP 文件

### 5. 编辑值持久化

- 每个数据条目的编辑值存储在 `editedValues[index]` 中
- 切换数据时自动保存当前编辑
- 返回已编辑的数据时自动恢复编辑值
- 批量生成时使用编辑后的值

## 注意事项

- **浏览器兼容性**: 建议使用 Chrome 或 Edge 浏览器
- **图片路径**: 图片文件需放在 `public/banner_demo/` 目录下
- **CSS 尺寸**: 导出的 PNG 尺寸与 CSS 中定义的尺寸一致（`pixelRatio: 1`）
- **相对路径**: HTML 中的相对路径会自动解析到 `public/banner_demo/` 目录
- **字段命名**: JSON 数据中的字段名必须与 HTML 模板中的 `data-field` 值完全匹配
- **价格字段**: 价格字段必须使用特殊结构，参考 `test.html` 中的示例

## 技术细节

### 图片导出

- 使用 `html-to-image` 库的 `toPng` 函数
- `pixelRatio: 1` 确保导出尺寸与 CSS 定义一致
- 优先导出 `.container` 元素，如果没有则导出 `body`

### 文件打包

- 使用 `JSZip` 库创建 ZIP 文件
- 所有 PNG 文件打包为一个 ZIP
- 文件名包含时间戳（格式：`YYYYMMDDHHmm`）

### Iframe 隔离

- 使用 `<iframe>` 和 `srcDoc` 渲染自定义 HTML/CSS
- 通过 `<base>` 标签处理相对路径
- 使用 `sandbox="allow-same-origin"` 允许同源访问

## Phase 2 扩展预留

- 支持多个模板选择
- 后端渲染支持（node-html-to-image）
- PSD 自动解析
- Excel 直接导入
- 模板市场/模板库

## License

MIT
