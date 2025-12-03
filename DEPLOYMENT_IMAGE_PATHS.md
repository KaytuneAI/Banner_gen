# 部署时图片路径问题分析与解决方案

## 当前实现分析

### 工作原理

1. **HTML 文件处理**：
   - 用户通过 `<input type="file">` 上传 HTML 文件
   - 文件内容被读取为字符串
   - 通过 `srcDoc` 注入到 iframe 中

2. **路径解析**：
   - 使用 `<base href="/banner_demo/">` 标签
   - 所有相对路径（如 `./image/logo.png`）会被解析为 `/banner_demo/image/logo.png`
   - 这些路径指向 `public/banner_demo/` 目录（Vite 的静态资源目录）

### 当前问题

**开发环境（本地）**：
- ✅ 图片文件在 `public/banner_demo/image/` 目录下
- ✅ 相对路径可以正确解析
- ✅ 一切正常工作

**生产环境（部署）**：
- ❌ 用户上传的 HTML 文件中的图片路径是相对路径
- ❌ 这些图片文件并没有被上传到服务器
- ❌ 即使上传了，路径结构可能不匹配
- ❌ 部署后，`public/banner_demo/` 是静态资源目录，需要预先放置图片

## 问题场景

### 场景 1：用户上传自定义 HTML 模板

用户上传了一个 HTML 文件，其中包含：
```html
<img src="./image/product.jpg" alt="产品图" />
```

**问题**：
- HTML 文件被读取为字符串，但图片文件 `product.jpg` 并没有被上传
- 系统尝试从 `/banner_demo/image/product.jpg` 加载图片
- 如果服务器上没有这个文件，图片会显示为破损

### 场景 2：用户使用自己的图片路径

用户上传的 HTML 中可能包含：
```html
<img src="C:/Users/username/Desktop/product.jpg" />
<!-- 或 -->
<img src="../images/product.jpg" />
```

**问题**：
- 这些路径在服务器上不存在
- 无法正确加载图片

## 解决方案

### 方案 1：要求用户同时上传图片文件（推荐）

**实现思路**：
1. 允许用户上传 HTML/CSS 和图片文件（多选）
2. 将图片文件转换为 Base64 或 Object URL
3. 在 HTML 中自动替换图片路径

**优点**：
- ✅ 完全自包含，不依赖服务器文件
- ✅ 用户上传什么，就能看到什么
- ✅ 适合完全自定义的模板

**缺点**：
- ❌ 需要修改上传逻辑
- ❌ 大图片会增加 HTML 大小（如果使用 Base64）

**实现步骤**：
1. 添加图片文件上传功能
2. 解析 HTML 中的图片路径
3. 匹配上传的图片文件
4. 将图片转换为 Base64 或 Object URL
5. 替换 HTML 中的图片路径

### 方案 2：使用 Base64 嵌入图片

**实现思路**：
1. 用户上传 HTML 和图片文件
2. 将所有图片转换为 Base64 字符串
3. 直接嵌入到 HTML 中：`<img src="data:image/png;base64,...">`

**优点**：
- ✅ 完全自包含
- ✅ 不需要额外的文件请求
- ✅ 适合小图片

**缺点**：
- ❌ 大图片会显著增加 HTML 大小
- ❌ Base64 编码会增加约 33% 的文件大小
- ❌ 可能影响性能

### 方案 3：使用 Object URL（当前部分支持）

**实现思路**：
1. 用户上传图片文件
2. 使用 `URL.createObjectURL()` 创建临时 URL
3. 在 HTML 中替换图片路径为 Object URL

**优点**：
- ✅ 不需要 Base64 编码
- ✅ 性能较好
- ✅ 代码中已有 `createImageMap` 函数（未使用）

**缺点**：
- ❌ Object URL 只在当前浏览器会话中有效
- ❌ 需要手动清理，避免内存泄漏
- ❌ 刷新页面后 URL 失效

### 方案 4：后端处理（适合生产环境）

**实现思路**：
1. 后端接收 HTML 和图片文件
2. 保存图片到服务器指定目录
3. 生成正确的 URL 路径
4. 返回处理后的 HTML

**优点**：
- ✅ 适合生产环境
- ✅ 可以处理大文件
- ✅ 可以缓存和优化图片
- ✅ 支持 CDN

**缺点**：
- ❌ 需要后端开发
- ❌ 需要文件存储系统
- ❌ 增加服务器负载

## 推荐实现：方案 1 + 方案 3（Object URL）

### 实现步骤

1. **添加图片文件上传功能**
   ```typescript
   const [imageFiles, setImageFiles] = useState<Map<string, string>>(new Map());
   // Map<文件名, Object URL>
   ```

2. **解析 HTML 中的图片路径**
   ```typescript
   const extractImagePaths = (html: string): string[] => {
     const parser = new DOMParser();
     const doc = parser.parseFromString(html, "text/html");
     const images = doc.querySelectorAll("img[src]");
     return Array.from(images).map(img => img.getAttribute("src") || "");
   };
   ```

3. **匹配并替换图片路径**
   ```typescript
   const replaceImagePaths = (html: string, imageMap: Map<string, string>): string => {
     const parser = new DOMParser();
     const doc = parser.parseFromString(html, "text/html");
     const images = doc.querySelectorAll("img[src]");
     
     images.forEach(img => {
       const src = img.getAttribute("src");
       if (!src) return;
       
       // 提取文件名（处理相对路径）
       const fileName = src.split("/").pop() || src;
       
       // 查找匹配的图片文件
       if (imageMap.has(fileName)) {
         img.setAttribute("src", imageMap.get(fileName)!);
       }
     });
     
     return doc.documentElement.outerHTML;
   };
   ```

4. **在 buildSrcDoc 中使用处理后的 HTML**
   ```typescript
   const processedHtml = replaceImagePaths(htmlContent, imageFiles);
   return buildSrcDoc(processedHtml, cssContent);
   ```

## 当前最佳实践（临时方案）

如果暂时不实现图片上传功能，可以：

1. **文档说明**：
   - 在 README 中明确说明：图片文件需要预先放在 `public/banner_demo/` 目录
   - 或者要求用户将图片路径改为绝对 URL（如 CDN 链接）

2. **路径规范**：
   - HTML 模板中的图片路径必须使用相对路径
   - 相对路径会解析到 `public/banner_demo/` 目录
   - 例如：`./image/logo.png` → `/banner_demo/image/logo.png`

3. **部署时**：
   - 将常用的图片资源放在 `public/banner_demo/` 目录
   - 或者使用 CDN 链接替换图片路径

## 总结

**当前状态**：
- ✅ 开发环境：正常工作
- ⚠️ 生产环境：需要预先放置图片文件，或使用 CDN

**推荐改进**：
- 实现图片文件上传功能
- 使用 Object URL 或 Base64 嵌入图片
- 自动替换 HTML 中的图片路径

**长期方案**：
- 考虑后端处理
- 支持图片上传和存储
- 支持 CDN 集成









