/**
 * HTML/CSS 处理工具函数
 */

// 从 HTML 中提取 head 中的 link 标签（用于外部 CSS）
export const extractLinkTags = (html: string): string => {
  const linkMatches = html.matchAll(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi);
  let linkTags = "";
  for (const match of linkMatches) {
    linkTags += match[0] + "\n    ";
  }
  return linkTags.trim();
};

// 构建 iframe 的 srcDoc 字符串
export const buildSrcDoc = (html: string, css: string): string => {
  // 如果 HTML 已经是完整的文档（来自 ZIP 上传，已内联所有资源），直接返回
  if (html.trim().startsWith("<!DOCTYPE html>") || html.trim().startsWith("<html")) {
    return html;
  }
  
  // 如果上传的 HTML 本身包含 <html> 等标签，提取 body 内容
  // 否则直接使用
  let htmlBody = html.trim();

  // 提取 head 中的 link 标签（外部 CSS）
  const linkTags = extractLinkTags(html);

  // 尝试提取 body 内容（如果 HTML 包含完整结构）
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    htmlBody = bodyMatch[1].trim();
  } else {
    // 如果没有 body 标签，检查是否包含完整的 html 结构
    const hasHtmlTag = /<html[^>]*>/i.test(html);
    if (hasHtmlTag) {
      // 如果包含 html 标签但没有 body，尝试提取 head 之后的内容
      const headEndMatch = html.match(/<\/head>([\s\S]*)/i);
      if (headEndMatch) {
        htmlBody = headEndMatch[1].trim();
      }
    }
    // 如果都没有，直接使用原始内容
  }

  const baseUrl = import.meta.env.BASE_URL;
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- 关键修复：使所有相对路径映射到正确的 base 路径 -->
    <base href="${baseUrl}">
    ${linkTags ? `    ${linkTags}\n    ` : ""}${css ? `<style>${css}</style>` : ""}
    <style>
      /* 字段高亮样式 */
      .field-highlight {
        outline: 3px solid #667eea !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3) !important;
        background-color: rgba(102, 126, 234, 0.1) !important;
        transition: all 0.2s ease !important;
      }
    </style>
  </head>
  <body>
    ${htmlBody}
  </body>
</html>`;
};

// 从 HTML 中提取 CSS（style 标签和 link 标签）
export const extractCssFromHtml = (html: string): string => {
  let extractedCss = "";

  // 提取 <style> 标签内的 CSS
  const styleMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  for (const match of styleMatches) {
    if (match[1]) {
      extractedCss += match[1].trim() + "\n\n";
    }
  }

  // 提取 <link rel="stylesheet"> 标签（注意：这里只是记录，实际 CSS 内容需要从文件读取）
  // 由于我们在 iframe 中使用 <base href>，link 标签的 href 会自动解析到正确的 base 路径
  // 所以不需要额外处理，link 标签会在 HTML 中保留

  return extractedCss.trim();
};

// 替换 HTML 中的 <img src="..."> 为 Base64
export const replaceHtmlImgSrcWithBase64 = (
  html: string,
  imageMap: Record<string, string>
): string => {
  return html.replace(
    /<img([^>]+)src=["']([^"']+)["']([^>]*)>/gi,
    (match, before, src, after) => {
      // 跳过已经是 data URL 或 http(s) 的链接
      if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")) {
        return match;
      }

      // 尝试多种路径格式匹配
      const normalizedPath = src.replace(/^\.\//, "").replace(/^\.\.\//, "");
      const fileName = normalizedPath.split("/").pop() || normalizedPath;
      
      // 按优先级尝试匹配
      const dataUrl = 
        imageMap[src] ||                              // 原始路径
        imageMap[normalizedPath] ||                    // 去掉 ./ 的路径
        imageMap["./" + normalizedPath] ||            // 添加 ./ 的路径
        imageMap[fileName] ||                          // 仅文件名
        (normalizedPath.startsWith("/") ? imageMap[normalizedPath.substring(1)] : null); // 去掉前导 /

      if (!dataUrl) {
        console.warn(`图片路径未匹配到base64: ${src}`, {
          availableKeys: Object.keys(imageMap).filter(k => k.includes(fileName))
        });
        return match; // 没有匹配上就保持原样（可能是外链图）
      }

      return `<img${before}src="${dataUrl}"${after}>`;
    }
  );
};

// 替换 CSS 中的 url(...) 为 Base64（支持图片和字体）
export const replaceCssUrlWithBase64 = (
  css: string,
  resourceMap: Record<string, string>
): string => {
  return css.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, urlPath) => {
    // 跳过已经是 data URL 或 http(s) 的链接
    if (urlPath.startsWith("http://") || urlPath.startsWith("https://") || urlPath.startsWith("data:")) {
      return match;
    }

    // 标准化路径
    const normalizedPath = urlPath.replace(/^\.\//, "").replace(/^\.\.\//, "");
    const dataUrl = resourceMap[urlPath] || resourceMap[normalizedPath] || resourceMap["./" + normalizedPath] || resourceMap[normalizedPath.split("/").pop() || ""];

    if (!dataUrl) {
      return match;
    }

    return `url("${dataUrl}")`;
  });
};

// 生成最终可注入 iframe 的内联 HTML（所有资源已 Base64 内联）
export const buildInlineHtml = (bodyHtml: string, cssText: string): string => {
  // 如果 bodyHtml 里已经包含 <html> / <body>，提取 body 内容
  const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let bodyContent = bodyHtml;
  
  if (bodyMatch) {
    bodyContent = bodyMatch[1].trim();
  } else {
    // 如果没有 body 标签，检查是否包含完整的 html 结构
    const hasHtmlTag = /<html[^>]*>/i.test(bodyHtml);
    if (hasHtmlTag) {
      const headEndMatch = bodyHtml.match(/<\/head>([\s\S]*)/i);
      if (headEndMatch) {
        bodyContent = headEndMatch[1].trim();
      }
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${cssText ? `<style>${cssText}</style>` : ""}
    <style>
      /* 字段高亮样式 */
      .field-highlight {
        outline: 3px solid #667eea !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3) !important;
        background-color: rgba(102, 126, 234, 0.1) !important;
        transition: all 0.2s ease !important;
      }
    </style>
  </head>
  <body>
    ${bodyContent}
  </body>
</html>`;
};



