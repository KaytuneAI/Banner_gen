import React, { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import { parseJsonFile } from "../../utils/fileHelpers";
import { exportNodeToPngDataUrl } from "../../utils/htmlExport";
import { BannerData } from "../../types";
import "./BannerBatchPage.css";

type TemplateField = {
  name: string;      // data-field 的值
  label?: string;    // data-label 的值（可选）
};

export const BannerBatchPage: React.FC = () => {
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [cssContent, setCssContent] = useState<string>("");
  const [htmlFileName, setHtmlFileName] = useState<string>("");
  const [cssFileName, setCssFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [iframeSize, setIframeSize] = useState<{ width: number; height: number } | null>(null);
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedFieldValue, setSelectedFieldValue] = useState<string>("");
  
  // JSON 数据相关状态
  const [jsonData, setJsonData] = useState<BannerData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  // 保存每个数据索引的编辑值：{ [index]: { [fieldName]: value } }
  const [editedValues, setEditedValues] = useState<Record<number, Record<string, string>>>({});

  const htmlInputRef = useRef<HTMLInputElement>(null);
  const cssInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 从 HTML 中提取 head 中的 link 标签（用于外部 CSS）
  const extractLinkTags = (html: string): string => {
    const linkMatches = html.matchAll(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi);
    let linkTags = "";
    for (const match of linkMatches) {
      linkTags += match[0] + "\n    ";
    }
    return linkTags.trim();
  };

  // 构建 iframe 的 srcDoc 字符串
  const buildSrcDoc = (html: string, css: string): string => {
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
  const extractCssFromHtml = (html: string): string => {
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

  // 处理 HTML 文件上传
  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawHtml = String(reader.result || "");

        // 1. 用 DOMParser 解析 HTML 字符串
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, "text/html");

        // 2. 找出所有带 data-field 的元素
        const fieldMap = new Map<string, TemplateField>();
        doc.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
          const name = el.getAttribute("data-field");
          if (!name) return;

          if (!fieldMap.has(name)) {
            const label = el.getAttribute("data-label") || undefined;
            fieldMap.set(name, { name, label });
          }
        });

        // 特殊处理价格字段（data-field-int 和 data-field-decimal）
        doc.querySelectorAll<HTMLElement>("[data-field-int]").forEach((el) => {
          const intName = el.getAttribute("data-field-int");
          const decimalName = el.getAttribute("data-field-decimal");
          if (intName && !fieldMap.has(intName)) {
            fieldMap.set(intName, { name: intName, label: "到手价-整数部分" });
          }
          if (decimalName && !fieldMap.has(decimalName)) {
            fieldMap.set(decimalName, { name: decimalName, label: "到手价-小数部分" });
          }
        });

        // 3. 保存字段列表（用于右侧显示）
        setTemplateFields(Array.from(fieldMap.values()));

        // 4. 原 html 正常注入 iframe（不修改）
        setHtmlContent(rawHtml);
        setHtmlFileName(file.name);

        // 自动提取 HTML 中的 CSS
        const extractedCss = extractCssFromHtml(rawHtml);
        const hasLinkCss = /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/i.test(rawHtml);
        
        // 构建成功消息
        let successMsg = `成功加载 HTML 模板: ${file.name}`;
        if (fieldMap.size > 0) {
          successMsg += `（检测到 ${fieldMap.size} 个可编辑字段）`;
        }
        
        if (extractedCss || hasLinkCss) {
          let cssInfo = [];
          if (extractedCss) cssInfo.push("内联 CSS");
          if (hasLinkCss) cssInfo.push("外部 CSS 链接");
          
          // 如果 HTML 中有内联 CSS，自动设置
          // 但如果用户已经上传了单独的 CSS 文件，保留用户的 CSS（优先级更高）
          if (!cssContent && extractedCss) {
            setCssContent(extractedCss);
            successMsg += `，已自动提取 ${cssInfo.join(" 和 ")}`;
          } else if (hasLinkCss && !extractedCss) {
            successMsg += `，检测到外部 CSS 链接`;
          } else if (extractedCss) {
            successMsg += `，检测到内联 CSS（但已使用单独上传的 CSS 文件）`;
          } else {
            successMsg += `，检测到外部 CSS 链接`;
          }
        }
        
        setSuccess(successMsg);
      } catch (err) {
        const message = err instanceof Error ? err.message : "HTML 文件读取失败";
        setError(message);
      }
    };

    reader.onerror = () => {
      setError("读取 HTML 文件时发生错误");
    };

    reader.readAsText(file, "utf-8");

    // 清空 input，允许重复上传同一文件
    if (htmlInputRef.current) {
      htmlInputRef.current.value = "";
    }
  };

  // 处理 CSS 文件上传
  const handleCssUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        setCssContent(text);
        setCssFileName(file.name);
        setSuccess(`成功加载 CSS 样式: ${file.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "CSS 文件读取失败";
        setError(message);
      }
    };

    reader.onerror = () => {
      setError("读取 CSS 文件时发生错误");
    };

    reader.readAsText(file, "utf-8");

    // 清空 input
    if (cssInputRef.current) {
      cssInputRef.current.value = "";
    }
  };

  // 清除 HTML
  const handleClearHtml = () => {
    setHtmlContent("");
    setHtmlFileName("");
    setTemplateFields([]); // 清除字段列表
    setSelectedField(null); // 清除选中字段
    setSelectedFieldValue("");
    setSuccess("已清除 HTML 模板");
  };

  // 替换 HTML 中的 <img src="..."> 为 Base64
  const replaceHtmlImgSrcWithBase64 = (
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
  const replaceCssUrlWithBase64 = (
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
  const buildInlineHtml = (bodyHtml: string, cssText: string): string => {
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

  // 处理 ZIP 文件上传
  const handleZipUpload = async (file: File | null) => {
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const zip = await JSZip.loadAsync(file);

      // 1. 找到 html、css、图片文件、字体文件、JSON 文件
      const htmlFiles: JSZip.JSZipObject[] = [];
      const cssFiles: JSZip.JSZipObject[] = [];
      const imageFiles: JSZip.JSZipObject[] = [];
      const fontFiles: JSZip.JSZipObject[] = [];
      const jsonFiles: JSZip.JSZipObject[] = [];

      zip.forEach((relativePath, entry) => {
        if (entry.dir) return;
        const lower = relativePath.toLowerCase();

        if (lower.endsWith(".html") || lower.endsWith(".htm")) {
          htmlFiles.push(entry);
        } else if (lower.endsWith(".css")) {
          cssFiles.push(entry);
        } else if (lower.endsWith(".json")) {
          jsonFiles.push(entry);
        } else if (
          lower.endsWith(".png") ||
          lower.endsWith(".jpg") ||
          lower.endsWith(".jpeg") ||
          lower.endsWith(".gif") ||
          lower.endsWith(".webp") ||
          lower.endsWith(".svg")
        ) {
          imageFiles.push(entry);
        } else if (
          lower.endsWith(".ttf") ||
          lower.endsWith(".otf") ||
          lower.endsWith(".woff") ||
          lower.endsWith(".woff2") ||
          lower.endsWith(".eot")
        ) {
          fontFiles.push(entry);
        }
      });

      if (htmlFiles.length === 0) {
        setError("ZIP 文件中未找到 HTML 文件");
        return;
      }

      // 2. 选主 html 文件（优先 index.html）
      const mainHtmlEntry =
        htmlFiles.find((f) => f.name.toLowerCase().includes("index")) ||
        htmlFiles[0];

      const rawHtml = await mainHtmlEntry.async("text");
      
      // 获取HTML文件所在目录（用于计算相对路径）
      const htmlDir = mainHtmlEntry.name.split("/").slice(0, -1).join("/");
      const htmlDirWithSlash = htmlDir ? htmlDir + "/" : "";

      // 3. 合并所有 css 文件内容
      let cssText = "";
      for (const cssEntry of cssFiles) {
        const cssPart = await cssEntry.async("text");
        cssText += "\n" + cssPart;
      }

      // 4. 构建字体路径 -> Base64 data URL 映射
      const fontMap: Record<string, string> = {};
      for (const fontEntry of fontFiles) {
        // 注意：JSZip 中的 name 是 zip 内相对路径，例如 "sample_ponds-1202/fonts/FZZCHJ.OTF"
        const ext = fontEntry.name.toLowerCase().split(".").pop() || "ttf";
        let mime = "font/ttf";
        
        if (ext === "otf") {
          mime = "font/opentype";
        } else if (ext === "woff") {
          mime = "font/woff";
        } else if (ext === "woff2") {
          mime = "font/woff2";
        } else if (ext === "eot") {
          mime = "application/vnd.ms-fontobject";
        } else if (ext === "ttf") {
          mime = "font/ttf";
        }

        const base64 = await fontEntry.async("base64");
        const dataUrl = `data:${mime};base64,${base64}`;

        // 存多种 key：原始路径、去掉前导 "./"、添加 "./"
        const normPath = fontEntry.name.replace(/^\.\//, "");
        fontMap[fontEntry.name] = dataUrl;
        fontMap[normPath] = dataUrl;
        fontMap["./" + normPath] = dataUrl;
        
        // 计算相对于HTML文件所在目录的路径
        if (htmlDir && fontEntry.name.startsWith(htmlDirWithSlash)) {
          const relativePath = fontEntry.name.substring(htmlDir.length + 1);
          fontMap[relativePath] = dataUrl;
          fontMap["./" + relativePath] = dataUrl;
        }
        
        // 也支持文件名匹配（只匹配文件名，不包含路径）
        const fileName = normPath.split("/").pop() || normPath;
        if (fileName !== normPath) {
          fontMap[fileName] = dataUrl;
        }
      }

      // 5. 构建图片路径 -> Base64 data URL 映射
      const imageMap: Record<string, string> = {};
      for (const imgEntry of imageFiles) {
        // 注意：JSZip 中的 name 是 zip 内相对路径，例如 "sample_ponds-1202/image/bg.png"
        const ext = imgEntry.name.toLowerCase().split(".").pop() || "png";
        let mime = "image/png";
        
        if (ext === "jpg" || ext === "jpeg") {
          mime = "image/jpeg";
        } else if (ext === "gif") {
          mime = "image/gif";
        } else if (ext === "webp") {
          mime = "image/webp";
        } else if (ext === "svg") {
          mime = "image/svg+xml";
        }

        const base64 = await imgEntry.async("base64");
        const dataUrl = `data:${mime};base64,${base64}`;

        // 存多种 key：原始路径、去掉前导 "./"、添加 "./"
        const normPath = imgEntry.name.replace(/^\.\//, "");
        imageMap[imgEntry.name] = dataUrl;
        imageMap[normPath] = dataUrl;
        imageMap["./" + normPath] = dataUrl;
        
        // 计算相对于HTML文件所在目录的路径
        // 例如：HTML在 "sample_ponds-1202/test.html"，图片在 "sample_ponds-1202/image/product.png"
        // 则相对路径为 "./image/product.png"
        if (htmlDir && imgEntry.name.startsWith(htmlDirWithSlash)) {
          const relativePath = imgEntry.name.substring(htmlDir.length + 1);
          imageMap[relativePath] = dataUrl;
          imageMap["./" + relativePath] = dataUrl;
        }
        
        // 也支持文件名匹配（只匹配文件名，不包含路径）
        const fileName = normPath.split("/").pop() || normPath;
        if (fileName !== normPath) {
          imageMap[fileName] = dataUrl;
        }
      }

      // 6. 合并图片和字体映射，用于 CSS 中的 url() 替换
      const resourceMap: Record<string, string> = { ...imageMap, ...fontMap };

      // 7. 替换 HTML 与 CSS 中的图片路径为 Base64
      const processedHtml = replaceHtmlImgSrcWithBase64(rawHtml, imageMap);
      const processedCss = replaceCssUrlWithBase64(cssText, resourceMap);

      // 8. 生成最终 HTML，用于 iframe srcDoc（所有资源已内联，不需要 base 标签）
      const finalHtml = buildInlineHtml(processedHtml, processedCss);

      // 9. 解析 data-field / data-label（沿用现有逻辑）
      const parser = new DOMParser();
      const doc = parser.parseFromString(finalHtml, "text/html");

      const fieldMap = new Map<string, TemplateField>();
      doc.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
        const name = el.getAttribute("data-field");
        if (!name) return;

        if (!fieldMap.has(name)) {
          const label = el.getAttribute("data-label") || undefined;
          fieldMap.set(name, { name, label });
        }
      });

      // 特殊处理价格字段（data-field-int 和 data-field-decimal）
      doc.querySelectorAll<HTMLElement>("[data-field-int]").forEach((el) => {
        const intName = el.getAttribute("data-field-int");
        const decimalName = el.getAttribute("data-field-decimal");
        if (intName && !fieldMap.has(intName)) {
          fieldMap.set(intName, { name: intName, label: "到手价-整数部分" });
        }
        if (decimalName && !fieldMap.has(decimalName)) {
          fieldMap.set(decimalName, { name: decimalName, label: "到手价-小数部分" });
        }
      });

      // 10. 处理 JSON 数据文件（如果存在）
      if (jsonFiles.length > 0) {
        try {
          // 优先查找常见的 JSON 文件名（data.json, test.json 等）
          const preferredJsonNames = ["data.json", "test.json", "banner.json", "template.json"];
          let jsonEntry = jsonFiles.find((f) => 
            preferredJsonNames.some(name => f.name.toLowerCase().includes(name.toLowerCase()))
          ) || jsonFiles[0];

          const jsonText = await jsonEntry.async("text");
          const parsedJson = JSON.parse(jsonText);
          
          // 处理 JSON 数据：将图片路径替换为 Base64 data URL
          const processedJsonData = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
          
          // 遍历 JSON 数据，替换图片路径为 Base64
          const processedData = processedJsonData.map((item: BannerData) => {
            const processedItem: BannerData = { ...item };
            
            // 遍历所有字段，查找图片路径并替换
            Object.keys(processedItem).forEach((key) => {
              const value = processedItem[key];
              
              // 处理数组类型的图片路径（如 product_main_src, gift_products_src）
              if (Array.isArray(value)) {
                const processedArray = value.map((path: string) => {
                  if (typeof path === "string" && path) {
                    const normalizedPath = path.replace(/^\.\//, "");
                    const base64Url = imageMap[path] || imageMap[normalizedPath] || imageMap["./" + normalizedPath] || imageMap[normalizedPath.split("/").pop() || ""];
                    return base64Url || path;  // 如果找不到 base64，保持原路径
                  }
                  return path;
                });
                processedItem[key] = processedArray;
              }
              // 处理字符串类型的图片路径
              else if (typeof value === "string" && value) {
                // 检查是否是图片路径（相对路径或文件名）
                const normalizedPath = value.replace(/^\.\//, "");
                const base64Url = imageMap[value] || imageMap[normalizedPath] || imageMap["./" + normalizedPath] || imageMap[normalizedPath.split("/").pop() || ""];
                
                if (base64Url) {
                  processedItem[key] = base64Url;
                }
              }
            });
            
            return processedItem;
          });

          // 如果zip文件里有json文件，第一个渲染html的内容（不应用json数据）
          // json的替换素材从第二个开始
          const dataWithEmptyFirst: BannerData[] = [{} as BannerData, ...processedData];
          setJsonData(dataWithEmptyFirst);
          setCurrentIndex(0);
          
          // 不自动应用数据，让第一个显示纯模板
        } catch (jsonErr) {
          console.warn("解析 ZIP 中的 JSON 文件失败:", jsonErr);
          // JSON 解析失败不影响模板加载，只记录警告
        }
      }

      // 9. 更新状态
      setTemplateFields(Array.from(fieldMap.values()));
      setHtmlContent(finalHtml);
      setCssContent(""); // ZIP 中的 CSS 已经内联到 HTML 中
      setHtmlFileName(file.name);
      setCssFileName("");

      let successMsg = `成功加载 ZIP 模板: ${file.name}`;
      if (htmlFiles.length > 0) {
        successMsg += ` (HTML: ${mainHtmlEntry.name})`;
      }
      if (cssFiles.length > 0) {
        successMsg += ` (CSS: ${cssFiles.length} 个文件)`;
      }
      if (imageFiles.length > 0) {
        successMsg += ` (图片: ${imageFiles.length} 个，已转为 Base64 内联)`;
      }
      if (fontFiles.length > 0) {
        successMsg += ` (字体: ${fontFiles.length} 个，已转为 Base64 内联)`;
      }
      if (jsonFiles.length > 0) {
        successMsg += ` (JSON: ${jsonFiles.length} 个文件，已自动加载数据)`;
      }
      if (fieldMap.size > 0) {
        successMsg += ` (发现 ${fieldMap.size} 个可编辑字段)`;
      }
      setSuccess(successMsg);

    } catch (err) {
      const message = err instanceof Error ? err.message : "ZIP 文件处理失败";
      setError(message);
      console.error("ZIP 处理错误:", err);
    }

    // 清空 input
    if (zipInputRef.current) {
      zipInputRef.current.value = "";
    }
  };

  // 点击预览区域上传 ZIP
  const handlePreviewAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 如果已经有 HTML 内容，不触发上传
    if (htmlContent) {
      return;
    }
    // 如果点击的是 iframe，不触发上传
    const target = e.target as HTMLElement;
    if (target.tagName === 'IFRAME') {
      return;
    }
    // 触发 ZIP 文件选择（包括点击 placeholder 和空白区域）
    if (zipInputRef.current) {
      zipInputRef.current.click();
    }
  };

  // 高亮 iframe 中的元素
  const highlightElementInIframe = useCallback((fieldName: string) => {
    if (!iframeRef.current) return;

    try {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // 清除之前的高亮
      const previousHighlighted = iframeDoc.querySelector(".field-highlight");
      if (previousHighlighted) {
        previousHighlighted.classList.remove("field-highlight");
      }

      // 特殊处理价格字段
      if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
        const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
        if (priceEl) {
          priceEl.classList.add("field-highlight");
          
          // 优先查找新的价格结构：.price-int-2, .price-int-3 和 .price-decimal-2, .price-decimal-3
          const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
          const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
          const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
          const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;

          let intValue = '';
          let decValue = '';

          if (priceInt2 || priceInt3 || priceDecimal2 || priceDecimal3) {
            // 使用新的价格结构
            intValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
            decValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
          } else {
            // 回退到旧逻辑：sign 后的文本节点 + .decimal span
          const signNode = priceEl.querySelector('.sign');
          const decimalNode = priceEl.querySelector('.decimal');
            intValue = signNode?.nextSibling?.nodeValue || '';
            decValue = decimalNode?.textContent || '';
          }
          
          setSelectedFieldValue(fieldName === 'sec_price_int' ? intValue : decValue);
          
          try {
            priceEl.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (e) {
            // 忽略错误
          }
        } else {
          setSelectedFieldValue("未找到对应元素");
        }
      } else {
        // 普通字段处理
        const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
        if (element) {
          // 添加高亮样式
          element.classList.add("field-highlight");
          
          // 获取元素的内容
          let value = "";
          if (element.tagName === "IMG") {
            value = (element as HTMLImageElement).src || "";
          } else {
            value = element.textContent?.trim() || element.innerText?.trim() || "";
          }
          setSelectedFieldValue(value);

          // 滚动到元素位置（在 iframe 内部滚动）
          try {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (e) {
            // 如果滚动失败，忽略错误
          }
        } else {
          setSelectedFieldValue("未找到对应元素");
        }
      }
    } catch (e) {
      console.warn("无法访问 iframe 内容:", e);
      setSelectedFieldValue("无法访问预览内容");
    }
  }, []);

  // 处理字段点击
  const handleFieldClick = (fieldName: string) => {
    // 如果点击的是已选中的字段，则取消选中；否则选中新字段
    if (selectedField === fieldName) {
      setSelectedField(null);
      setSelectedFieldValue("");
      // 清除高亮
      if (iframeRef.current) {
        try {
          const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
          if (iframeDoc) {
            const highlighted = iframeDoc.querySelector(".field-highlight");
            if (highlighted) {
              highlighted.classList.remove("field-highlight");
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }
    } else {
      setSelectedField(fieldName);
      highlightElementInIframe(fieldName);
    }
  };

  // 更新价格字段（特殊处理，因为价格结构特殊）
  // 统一价格系统：根据整数位数自动切换 class，确保 DOM 结构统一
  const updatePriceFields = useCallback((iframeDoc: Document, intValue: string, decimalValue: string) => {
    const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
    if (!priceEl) return;

    // 根据整数位数决定使用 2 位还是 3 位样式
    const intLength = intValue.length;
    const is2Digits = intLength <= 2;
    const targetIntClass = is2Digits ? 'price-int-2' : 'price-int-3';
    const targetDecimalClass = is2Digits ? 'price-decimal-2' : 'price-decimal-3';
    const targetBaseClass = is2Digits ? 'price--2digits' : 'price--3digits';

    // 同步更新外层 base class（price--2digits / price--3digits）
    priceEl.classList.remove('price--2digits', 'price--3digits');
    priceEl.classList.add(targetBaseClass);

    // 查找或创建整数 span
    let priceIntSpan = priceEl.querySelector('.price-int-2') as HTMLElement || 
                       priceEl.querySelector('.price-int-3') as HTMLElement;
    
    if (!priceIntSpan) {
      // 如果不存在，创建新的整数 span
      priceIntSpan = iframeDoc.createElement('span');
      priceIntSpan.classList.add(targetIntClass);
      
      // 查找 sign 节点，在其后插入
      const signNode = priceEl.querySelector('.sign');
      if (signNode) {
        // 查找 sign 后的第一个非 sign 节点
        let insertBefore = signNode.nextSibling;
        while (insertBefore && 
               (insertBefore.nodeType === Node.TEXT_NODE || 
                (insertBefore.nodeType === Node.ELEMENT_NODE && 
                 (insertBefore as HTMLElement).classList.contains('sign')))) {
          insertBefore = insertBefore.nextSibling;
        }
        if (insertBefore) {
          priceEl.insertBefore(priceIntSpan, insertBefore);
        } else {
          priceEl.appendChild(priceIntSpan);
        }
      } else {
        // 如果没有 sign，直接添加到开头
        priceEl.insertBefore(priceIntSpan, priceEl.firstChild);
      }
    } else {
      // 如果已存在，切换 class
      priceIntSpan.classList.remove('price-int-2', 'price-int-3');
      priceIntSpan.classList.add(targetIntClass);
    }

    // 更新整数内容
    priceIntSpan.textContent = intValue;

    // 查找或创建小数 span
    let priceDecimalSpan = priceEl.querySelector('.price-decimal-2') as HTMLElement || 
                           priceEl.querySelector('.price-decimal-3') as HTMLElement;
    
    if (!priceDecimalSpan) {
      // 如果不存在，创建新的小数 span
      priceDecimalSpan = iframeDoc.createElement('span');
      priceDecimalSpan.classList.add(targetDecimalClass);
      
      // 在整数 span 后插入
      if (priceIntSpan.nextSibling) {
        priceEl.insertBefore(priceDecimalSpan, priceIntSpan.nextSibling);
      } else {
        priceEl.appendChild(priceDecimalSpan);
      }
    } else {
      // 如果已存在，切换 class
      priceDecimalSpan.classList.remove('price-decimal-2', 'price-decimal-3');
      priceDecimalSpan.classList.add(targetDecimalClass);
    }

    // 更新小数内容
    const finalDecimalValue = decimalValue.startsWith('.') ? decimalValue : '.' + decimalValue;
    priceDecimalSpan.textContent = finalDecimalValue;

    // 清理旧结构：删除 sign 后的文本节点和旧的 .decimal span
    const signNode = priceEl.querySelector('.sign');
    if (signNode) {
      let node = signNode.nextSibling;
      while (node) {
        const nextSibling = node.nextSibling;
        
        // 删除文本节点（旧结构留下的）
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) {
          node.remove();
        }
        // 删除或清空旧的 .decimal span（不是 price-decimal-*）
        else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.classList.contains('decimal') && 
              !el.classList.contains('price-decimal-2') && 
              !el.classList.contains('price-decimal-3')) {
            el.remove();
          }
        }
        
        node = nextSibling;
      }
    }

    // 确保只有一个整数 span 和一个小数 span（清理多余的）
    const allIntSpans = priceEl.querySelectorAll('.price-int-2, .price-int-3');
    const allDecimalSpans = priceEl.querySelectorAll('.price-decimal-2, .price-decimal-3');
    
    if (allIntSpans.length > 1) {
      // 保留第一个，删除其他的
      for (let i = 1; i < allIntSpans.length; i++) {
        allIntSpans[i].remove();
      }
    }
    
    if (allDecimalSpans.length > 1) {
      // 保留第一个，删除其他的
      for (let i = 1; i < allDecimalSpans.length; i++) {
        allDecimalSpans[i].remove();
      }
    }
  }, []);

  // 更新 iframe 中字段的值
  const updateFieldValue = useCallback((fieldName: string, newValue: string) => {
    if (!iframeRef.current) return;

    try {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // 特殊处理价格字段
      if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') {
        const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
        if (priceEl) {
          // 高亮整个价格区域
          if (!priceEl.classList.contains("field-highlight")) {
            const previousHighlighted = iframeDoc.querySelector(".field-highlight");
            if (previousHighlighted) {
              previousHighlighted.classList.remove("field-highlight");
            }
            priceEl.classList.add("field-highlight");
          }

          // 获取当前价格值（用于确定需要更新的值）
          const priceInt2 = priceEl.querySelector('.price-int-2') as HTMLElement;
          const priceInt3 = priceEl.querySelector('.price-int-3') as HTMLElement;
          const priceDecimal2 = priceEl.querySelector('.price-decimal-2') as HTMLElement;
          const priceDecimal3 = priceEl.querySelector('.price-decimal-3') as HTMLElement;

          let currentIntValue = (priceInt2?.textContent || priceInt3?.textContent || '').trim();
          let currentDecValue = (priceDecimal2?.textContent || priceDecimal3?.textContent || '').trim();
          
          // 如果没有找到新结构，尝试从旧结构读取
          if (!currentIntValue && !currentDecValue) {
            const signNode = priceEl.querySelector('.sign');
            const decimalNode = priceEl.querySelector('.decimal');
            currentIntValue = signNode?.nextSibling?.nodeValue?.trim() || '';
            currentDecValue = decimalNode?.textContent?.trim() || '';
          }

          // 确定要更新的值
          let finalIntValue = fieldName === 'sec_price_int' ? newValue : currentIntValue;
          let finalDecValue = fieldName === 'sec_price_decimal' 
            ? (newValue.startsWith('.') ? newValue : '.' + newValue)
            : currentDecValue;

          // 使用 updatePriceFields 统一处理（会自动切换 class 和创建缺失的 span）
          updatePriceFields(iframeDoc, finalIntValue, finalDecValue.replace(/^\./, ''));

          // 更新显示值
          setSelectedFieldValue(fieldName === 'sec_price_int' ? finalIntValue : finalDecValue);
        }
      } else {
        // 普通字段处理
        const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
        if (element) {
          // 确保高亮样式还在
          if (!element.classList.contains("field-highlight")) {
            // 清除其他高亮
            const previousHighlighted = iframeDoc.querySelector(".field-highlight");
            if (previousHighlighted) {
              previousHighlighted.classList.remove("field-highlight");
            }
            element.classList.add("field-highlight");
          }

          if (element.tagName === "IMG") {
            // 如果是图片，更新 src
            (element as HTMLImageElement).src = newValue;
          } else {
            // 如果是文本元素，更新内容
            element.textContent = newValue;
          }
          
          // 更新当前值状态
          setSelectedFieldValue(newValue);
        }
      }
      
      // 保存编辑的值到 editedValues
      setEditedValues(prev => ({
        ...prev,
        [currentIndex]: {
          ...prev[currentIndex],
          [fieldName]: newValue
        }
      }));
    } catch (e) {
      console.warn("无法更新 iframe 内容:", e);
    }
  }, [currentIndex, updatePriceFields]);

  // 清除 CSS
  const handleClearCss = () => {
    setCssContent("");
    setCssFileName("");
    setSuccess("已清除 CSS 样式");
  };

  // JSON 文件上传处理
  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const parsed = await parseJsonFile(file);
      setJsonData(parsed);
      setCurrentIndex(0);
      setSuccess(`成功加载 ${parsed.length} 条数据`);
      // 应用第一条数据到预览
      if (parsed.length > 0) {
        applyJsonDataToIframe(parsed[0], 0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "JSON 解析失败";
      setError(message);
      setJsonData([]);
    }

    if (jsonInputRef.current) {
      jsonInputRef.current.value = "";
    }
  };

  // 将 JSON 数据应用到 iframe（会合并已编辑的值）
  const applyJsonDataToIframe = useCallback((data: BannerData, index: number) => {
    if (!iframeRef.current || !htmlContent) return;

    try {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return;

      // 获取该索引的编辑值（如果有）
      const edits = editedValues[index] || {};

      // 特殊处理价格区域
      if (data.sec_price_int !== undefined && data.sec_price_decimal !== undefined) {
        const intValue = edits.sec_price_int !== undefined ? edits.sec_price_int : String(data.sec_price_int);
        const decimalValue = edits.sec_price_decimal !== undefined ? edits.sec_price_decimal : String(data.sec_price_decimal);
        updatePriceFields(iframeDoc, intValue, decimalValue);
      }

      // 特殊处理主产品图片数组（product_main_src）
      // 复用模板里的 <img> 结构，只改 src，保持原有样式和布局
      if (data.product_main_src !== undefined) {
        const productContainer = iframeDoc.querySelector(".product") as HTMLElement;
        if (productContainer) {
          // 获取原始图片节点（模板里的）
          const templateImgs = Array.from(productContainer.querySelectorAll("img")) as HTMLImageElement[];

          // 获取图片源（支持字符串或数组）
          let baseImgs: string[] = [];
          const rawValue = edits.product_main_src !== undefined ? edits.product_main_src : data.product_main_src;
          
          if (Array.isArray(rawValue)) {
            baseImgs = rawValue.map(v => String(v));
          } else if (rawValue) {
            baseImgs = [String(rawValue)];
          }

          // 获取数量（qty），如果没有则默认为 1
          const qtyValue = edits.product_main_qty !== undefined ? edits.product_main_qty : data.product_main_qty;
          const qty = qtyValue !== undefined ? Number(qtyValue) : (baseImgs.length || 1);
          
          // 根据 qty 复制图片
          let imgs: string[] = [];
          if (baseImgs.length > 0) {
            // 如果 baseImgs 只有一张，根据 qty 复制
            if (baseImgs.length === 1) {
              imgs = Array(qty).fill(baseImgs[0]);
            } else {
              // 如果 baseImgs 是多张，使用前 qty 张（或全部，取较小值）
              imgs = baseImgs.slice(0, Math.max(1, qty));
            }
          }

          // 如果模板里本来就有 img，用它们当"样板"
          if (templateImgs.length > 0) {
            // 先确保至少有 imgs.length 个 img 节点，不够就 clone 最后一个
            while (templateImgs.length < imgs.length) {
              const lastImg = templateImgs[templateImgs.length - 1];
              const clone = lastImg.cloneNode(true) as HTMLImageElement;
              productContainer.appendChild(clone);
              templateImgs.push(clone);
            }

            // 给前 imgs.length 个节点设置 src，并显示出来
            imgs.forEach((src, idx) => {
              const img = templateImgs[idx];
              img.src = src;
              img.style.display = ""; // 恢复显示（清除可能的 display: none）
              // 保持原有的 class、style、data-field 等属性，不覆盖
            });

            // 多余的模板节点隐藏掉
            for (let i = imgs.length; i < templateImgs.length; i++) {
              const img = templateImgs[i];
              img.style.display = "none";
            }
          } else {
            // 万一模板里一个 img 都没有，再退回到"新建 img"的方案
            productContainer.innerHTML = "";
            imgs.forEach((src) => {
              const img = iframeDoc.createElement("img");
              img.src = src;
              img.alt = "主产品";
              img.setAttribute("data-field", "product_main_src");
              img.setAttribute("data-label", "主产品图片");
              productContainer.appendChild(img);
            });
          }
        }
      }

      // 特殊处理赠品图片（支持 gift_products_src 数组或 gift_products_src_1 + qty）
      // 优先检查 gift_products_src（数组形式）
      if (data.gift_products_src !== undefined) {
        const giftContainer = iframeDoc.querySelector(".giftproducts") as HTMLElement;
        if (giftContainer) {
          // 获取图片数组（支持字符串或数组）
          let baseImgs: string[] = [];
          const rawValue = edits.gift_products_src !== undefined ? edits.gift_products_src : data.gift_products_src;
          
          if (Array.isArray(rawValue)) {
            baseImgs = rawValue.map(v => String(v));
          } else if (rawValue) {
            baseImgs = [String(rawValue)];
          }

          // 获取数量（qty），如果没有则默认为 1
          const qtyValue = edits.gift_products_qty !== undefined ? edits.gift_products_qty : data.gift_products_qty;
          const qty = qtyValue !== undefined ? Number(qtyValue) : 1;
          
          // 根据 qty 复制图片
          let imgs: string[] = [];
          if (baseImgs.length > 0) {
            if (baseImgs.length === 1) {
              imgs = Array(qty).fill(baseImgs[0]);
            } else {
              imgs = baseImgs.slice(0, Math.max(1, qty));
            }
          }

          // 清空旧 DOM，避免残留
          giftContainer.innerHTML = "";

          // 根据数量确定 class（1张、2张、3张）
          const count = imgs.length;
          const className = `giftproductsimg-${count}`;

          // 动态创建图片元素
          imgs.forEach((src, idx) => {
            const img = iframeDoc.createElement("img");
            img.src = src;  // src 已经是 base64 或完整路径
            img.alt = `赠品${idx + 1}`;
            img.className = className;  // 使用 giftproductsimg-1/2/3
            img.setAttribute("data-field", `gift_products_src_${idx + 1}`);
            img.setAttribute("data-label", `赠品图片${idx + 1}`);
            giftContainer.appendChild(img);
          });
        }
      }
      // 如果没有 gift_products_src，尝试使用 gift_products_src_1 + gift_products_qty_1
      else if (data.gift_products_src_1 !== undefined) {
        const giftContainer = iframeDoc.querySelector(".giftproducts") as HTMLElement;
        if (giftContainer) {
          // 获取第一张赠品图片
          const giftSrc1 = edits.gift_products_src_1 !== undefined ? edits.gift_products_src_1 : data.gift_products_src_1;
          
          // 获取数量（gift_products_qty_1），如果没有则默认为 1
          const qtyValue = edits.gift_products_qty_1 !== undefined ? edits.gift_products_qty_1 : data.gift_products_qty_1;
          const qty = qtyValue !== undefined ? Number(qtyValue) : 1;
          
          // 根据 qty 复制图片
          const imgs: string[] = Array(qty).fill(String(giftSrc1));

          // 清空旧 DOM，避免残留
          giftContainer.innerHTML = "";

          // 根据数量确定 class（1张、2张、3张）
          const count = imgs.length;
          const className = `giftproductsimg-${count}`;

          // 动态创建图片元素
          imgs.forEach((src, idx) => {
            const img = iframeDoc.createElement("img");
            img.src = src;  // src 已经是 base64 或完整路径
            img.alt = `赠品${idx + 1}`;
            img.className = className;  // 使用 giftproductsimg-1/2/3
            img.setAttribute("data-field", `gift_products_src_${idx + 1}`);
            img.setAttribute("data-label", `赠品图片${idx + 1}`);
            giftContainer.appendChild(img);
          });
        }
      }

      // 遍历所有字段，更新对应元素（跳过价格字段和已特殊处理的数组字段）
      Object.entries(data).forEach(([fieldName, value]) => {
        if (value === undefined || value === null) return;
        // 跳过价格字段和数组字段（已特殊处理）
        if (fieldName === 'sec_price_int' || 
            fieldName === 'sec_price_decimal' || 
            fieldName === 'product_main_src' || 
            fieldName === 'gift_products_src') return;

        // 如果是数组类型，跳过（由上面的特殊处理逻辑处理）
        if (Array.isArray(value)) return;

        const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
        if (element) {
          // 优先使用编辑的值，否则使用 JSON 中的值
          const finalValue = edits[fieldName] !== undefined ? edits[fieldName] : String(value);
          
          // 处理图片路径（直接使用 JSON 中的路径，base 标签会自动处理相对路径）
          if (element.tagName === "IMG") {
            (element as HTMLImageElement).src = finalValue;
          } else {
            element.textContent = finalValue;
          }
        }
      });
      
      // 应用编辑值中可能存在的额外字段（不在 JSON 中的）
      // 注意：数组字段（product_main_src, gift_products_src）已在上面特殊处理，这里跳过
      Object.entries(edits).forEach(([fieldName, value]) => {
        if (data[fieldName] === undefined && 
            fieldName !== 'sec_price_int' && 
            fieldName !== 'sec_price_decimal' &&
            fieldName !== 'product_main_src' &&
            fieldName !== 'gift_products_src') {
          const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
          if (element) {
            // 跳过数组类型的编辑值（应该通过特殊处理逻辑处理）
            if (Array.isArray(value)) return;
            
            if (element.tagName === "IMG") {
              (element as HTMLImageElement).src = String(value);
            } else {
              element.textContent = String(value);
            }
          }
        }
      });
    } catch (e) {
      console.warn("无法应用 JSON 数据到 iframe:", e);
    }
  }, [htmlContent, editedValues, updatePriceFields]);

  // 当前数据变化时，应用到 iframe
  useEffect(() => {
    if (jsonData.length > 0 && currentIndex >= 0 && currentIndex < jsonData.length) {
      const timer = setTimeout(() => {
        // 如果是第一个索引（索引0），且是空对象，重置 iframe 到原始 HTML 内容
        if (currentIndex === 0 && Object.keys(jsonData[currentIndex]).length === 0) {
          // 重新设置 iframe 的 srcdoc，重置到原始 HTML
          if (iframeRef.current && htmlContent) {
            iframeRef.current.srcdoc = buildSrcDoc(htmlContent, cssContent);
            
            // 等待 iframe 加载完成后，恢复选中字段的值（如果有）
            const loadHandler = () => {
              if (selectedField && iframeRef.current) {
                try {
                  const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
                  if (iframeDoc) {
                    const element = iframeDoc.querySelector(`[data-field="${selectedField}"]`) as HTMLElement;
                    if (element) {
                      if (element.tagName === "IMG") {
                        setSelectedFieldValue((element as HTMLImageElement).src || "");
                      } else {
                        setSelectedFieldValue(element.textContent?.trim() || "");
                      }
                    }
                  }
                } catch (e) {
                  // 忽略错误
                }
              }
              if (iframeRef.current) {
                iframeRef.current.removeEventListener('load', loadHandler);
              }
            };
            
            if (iframeRef.current) {
              iframeRef.current.addEventListener('load', loadHandler);
            }
          }
        } else {
          // 对于其他索引，正常应用 JSON 数据
        applyJsonDataToIframe(jsonData[currentIndex], currentIndex);
        
        // 恢复当前索引的选中字段值（如果有编辑过）
        if (selectedField) {
          const edits = editedValues[currentIndex];
          if (edits && edits[selectedField] !== undefined) {
            setSelectedFieldValue(edits[selectedField]);
          } else {
            // 从 iframe 中读取当前值
            if (iframeRef.current) {
              try {
                const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
                if (iframeDoc) {
                  const element = iframeDoc.querySelector(`[data-field="${selectedField}"]`) as HTMLElement;
                  if (element) {
                    if (element.tagName === "IMG") {
                      setSelectedFieldValue((element as HTMLImageElement).src || "");
                    } else {
                      setSelectedFieldValue(element.textContent?.trim() || "");
                    }
                  }
                }
              } catch (e) {
                // 忽略错误
                }
              }
            }
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [jsonData, currentIndex, applyJsonDataToIframe, selectedField, editedValues, htmlContent, cssContent]);

  // 切换到上一条
  const handlePrev = () => {
    if (currentIndex > 0) {
      // 保存当前编辑的值（如果有）
      if (selectedField && selectedFieldValue) {
        setEditedValues(prev => ({
          ...prev,
          [currentIndex]: {
            ...prev[currentIndex],
            [selectedField]: selectedFieldValue
          }
        }));
      }
      setCurrentIndex(currentIndex - 1);
    }
  };

  // 切换到下一条
  const handleNext = () => {
    if (currentIndex < jsonData.length - 1) {
      // 保存当前编辑的值（如果有）
      if (selectedField && selectedFieldValue) {
        setEditedValues(prev => ({
          ...prev,
          [currentIndex]: {
            ...prev[currentIndex],
            [selectedField]: selectedFieldValue
          }
        }));
      }
      setCurrentIndex(currentIndex + 1);
    }
  };

  // 批量生成所有 Banner（打包成 ZIP）
  const handleGenerateAll = async () => {
    if (!iframeRef.current || jsonData.length === 0) {
      setError("请先上传 JSON 数据");
      return;
    }

    setIsGenerating(true);
    setError("");
    setSuccess("");

    try {
      const zip = new JSZip();
      let successCount = 0;
      let bannerIndex = 0; // 用于文件名的序号，从1开始

      for (let i = 0; i < jsonData.length; i++) {
        // 跳过第一个空对象（纯模板），只生成实际的json数据
        if (i === 0 && Object.keys(jsonData[i]).length === 0) {
          continue;
        }
        
        bannerIndex++; // 实际生成的文件序号从1开始
        setCurrentIndex(i);
        
        // 应用数据（包括编辑的值）
        applyJsonDataToIframe(jsonData[i], i);
        
        // 等待数据应用和渲染
        await new Promise((resolve) => setTimeout(resolve, 300));

        const iframe = iframeRef.current;
        if (!iframe) continue;

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) continue;

        // 优先导出 .container 元素，如果没有则使用 body
        const container = iframeDoc.querySelector('.container') as HTMLElement;
        const exportElement = container || iframeDoc.body;
        if (!exportElement) continue;

        const row = jsonData[i];
        // 生成时间戳（年月日时分，如 202511300120）
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const timestamp = `${year}${month}${day}${hour}${minute}`;
        
        // 如果有 id，使用 id_时间戳，否则使用 banner_序号_时间戳（序号从1开始）
        const fileName = row.id 
          ? `${row.id}_${timestamp}.png`
          : `banner_${bannerIndex}_${timestamp}.png`;

        try {
          // 导出为 Data URL
          const dataUrl = await exportNodeToPngDataUrl(exportElement);
          
          // 将 Data URL 转换为 Blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          
          // 添加到 ZIP
          zip.file(fileName, blob);
          successCount++;
        } catch (err) {
          console.error(`导出第 ${i + 1} 条失败:`, err);
        }
      }

      if (successCount > 0) {
        // 生成 ZIP 文件
        const zipBlob = await zip.generateAsync({ type: "blob" });
        
        // 生成时间戳（年月日时分，如 202511300120）
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const timestamp = `${year}${month}${day}${hour}${minute}`;
        
        // 下载 ZIP 文件
        const a = document.createElement("a");
        a.href = URL.createObjectURL(zipBlob);
        a.download = `banners_${timestamp}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        setSuccess(`成功生成 ${successCount} 张 Banner，已打包为 ZIP 文件`);
      } else {
        setError("没有成功生成任何 Banner");
      }
    } catch (err) {
      setError("批量生成过程中出现错误，请查看控制台");
      console.error("批量生成错误:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // 调整 iframe 尺寸以匹配内容
  const adjustIframeSize = useCallback(() => {
    if (!iframeRef.current) return;

    const checkSize = () => {
      try {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;

        const body = iframeDoc.body;
        const html = iframeDoc.documentElement;

        if (body && html) {
          // 获取内容的实际尺寸
          const width = Math.max(
            body.scrollWidth,
            body.offsetWidth,
            html.clientWidth,
            html.scrollWidth,
            html.offsetWidth
          );
          const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
          );

          // 设置 iframe 尺寸
          if (width > 0 && height > 0) {
            setIframeSize({ width, height });
          }
        }
      } catch (e) {
        // 跨域或其他错误时，使用默认尺寸
        console.warn("无法获取 iframe 内容尺寸:", e);
      }
    };

    // 延迟检查，确保内容已渲染
    setTimeout(checkSize, 50);
    
    // 也等待图片等资源加载
    setTimeout(checkSize, 300);
    setTimeout(checkSize, 600);
  }, []);

  // 当 HTML 或 CSS 内容变化时，调整 iframe 尺寸
  useEffect(() => {
    if (htmlContent) {
      // 重置尺寸，等待重新计算
      setIframeSize(null);
      // 清除选中字段（因为内容已变化）
      setSelectedField(null);
      setSelectedFieldValue("");
      // 延迟一下，确保 iframe 内容已渲染
      const timer1 = setTimeout(() => {
        adjustIframeSize();
      }, 100);
      const timer2 = setTimeout(() => {
        adjustIframeSize();
      }, 500);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else {
      setIframeSize(null);
      setSelectedField(null);
      setSelectedFieldValue("");
    }
  }, [htmlContent, cssContent, adjustIframeSize]);

  // 当选中字段变化时，重新高亮（用于 iframe 内容更新后）
  useEffect(() => {
    if (selectedField && htmlContent) {
      // 延迟一下，确保 iframe 内容已渲染
      const timer = setTimeout(() => {
        highlightElementInIframe(selectedField);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [selectedField, htmlContent, cssContent, highlightElementInIframe]);

  return (
    <div className="banner-batch-page">
      <div className="banner-batch-header">
        <div className="header-logo">
          <img 
            src={`${import.meta.env.BASE_URL}image/kaytuneai logo.png`}
            alt="KaytuneAI Logo" 
            className="logo-image"
          />
        </div>
        <h1>FluidDAM - 广告模板批量编辑工具</h1>
      </div>

      <div className="banner-batch-content">
        {/* 左侧预览区 */}
        <div className="banner-preview-section">
          <div 
            className={`banner-preview-wrapper ${!htmlContent ? 'clickable-upload' : ''}`}
            onClick={handlePreviewAreaClick}
            title={htmlContent ? '' : '点击上传 ZIP 模板'}
          >
            {htmlContent ? (
              <iframe
                ref={iframeRef}
                title="banner-preview"
                className="preview-iframe"
                srcDoc={buildSrcDoc(htmlContent, cssContent)}
                sandbox="allow-same-origin"
                style={
                  iframeSize
                    ? {
                        width: `${iframeSize.width}px`,
                        height: `${iframeSize.height}px`,
                        maxWidth: "100%",
                      }
                    : undefined
                }
                onLoad={adjustIframeSize}
              />
            ) : (
              <div className="banner-placeholder">
                <p>上传 ZIP 模板文件</p>
                <p className="hint">包含 HTML、CSS、图片和Json替换文件的 ZIP 文件</p>
              </div>
            )}
          </div>

          {/* 模板选择区域 */}
          <div className="template-selector">
            <h3>选择模板</h3>
            
            {/* ZIP 上传区域 */}
            <div className="template-upload-section">
              <h3>上传模板（包含 HTML、CSS、图片和Json替换文件的 ZIP 文件）</h3>
              <p className="template-upload-hint">
                <br></br>
              </p>
              <label className="template-upload-label">
                <input
                  ref={zipInputRef}
                  type="file"
                  accept=".zip"
                  onChange={(e) => handleZipUpload(e.target.files?.[0] || null)}
                  className="template-file-input"
                />
                <span className="btn btn-primary btn-small">上传 ZIP 模板</span>
              </label>
            </div>

            {htmlContent ? (
              <div className="template-info">
                <div className="template-status">
                  <span className="template-status-icon">✓</span>
                  <span>已加载模板文件</span>
                </div>
                {htmlFileName && (
                  <div className="template-file-name">
                    <span>模板: {htmlFileName}</span>
                    <button
                      onClick={() => {
                        setHtmlContent("");
                        setCssContent("");
                        setHtmlFileName("");
                        setCssFileName("");
                        setTemplateFields([]);
                        setSelectedField(null);
                        setSelectedFieldValue("");
                        setSuccess("已清除模板");
                      }}
                      className="template-clear-btn"
                      title="清除模板"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* 右侧控制面板 */}
        <div className="banner-control-panel">
          {/* 消息提示 */}
          {error && (
            <div className="message message-error">
              <span>⚠️</span> {error}
            </div>
          )}
          {success && (
            <div className="message message-success">
              <span>✓</span> {success}
            </div>
          )}

          {/* 模板字段列表 */}
          <div className="control-section">
            <h3>本模板可编辑字段</h3>
            {templateFields.length === 0 ? (
              <p style={{ color: "#999", fontSize: 12 }}>
                尚未检测到任何 data-field
              </p>
            ) : (
              <ul className="template-fields-list">
                {templateFields.map((f) => {
                  const isSelected = selectedField === f.name;
                  const isImageField = f.name.includes("_src") || f.name.includes("image") || f.name.includes("img");
                  
                  return (
                    <li
                      key={f.name}
                      className={`template-field-item ${isSelected ? "selected" : ""}`}
                    >
                      <div
                        className="template-field-header"
                        onClick={() => handleFieldClick(f.name)}
                        style={{ cursor: "pointer" }}
                      >
                        <strong>{f.label || f.name}</strong>
                        <span style={{ marginLeft: 8, color: "#999", fontSize: 12 }}>
                          ({f.name})
                        </span>
                      </div>
                      {isSelected && (
                        <div className="template-field-editor">
                          <div className="field-value-label">当前值：</div>
                          {isImageField ? (
                            <input
                              type="text"
                              className="field-value-input"
                              value={selectedFieldValue}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                setSelectedFieldValue(newValue);
                                updateFieldValue(f.name, newValue);
                              }}
                              placeholder="输入图片 URL 或路径"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <textarea
                              className="field-value-textarea"
                              value={selectedFieldValue}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                setSelectedFieldValue(newValue);
                                updateFieldValue(f.name, newValue);
                              }}
                              placeholder="输入文本内容"
                              rows={2}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* JSON 数据上传 */}
          <div className="control-section">
            <h3>批量替换素材</h3>
            <label className="template-upload-label">
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleJsonUpload}
                className="file-input"
              />
              <span className="file-input-label">
                {jsonData.length > 0 ? `批量替换素材 (已加载 ${jsonData.length} 条)` : "选择 JSON 文件"}
              </span>
            </label>
            {jsonData.length > 0 && (
              <div className="info-text">
                <strong>✓ 已加载 {jsonData.length} 条数据</strong>
              </div>
            )}
          </div>

          {/* 预览控制 */}
          {jsonData.length > 0 && (
            <div className="control-section">
              <h3>预览控制</h3>
              <div className="preview-controls">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="btn btn-secondary"
                >
                  ← 上一条
                </button>
                <span className="preview-index">
                  {currentIndex + 1} / {jsonData.length}
                </span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === jsonData.length - 1}
                  className="btn btn-secondary"
                >
                  下一条 →
                </button>
              </div>
            </div>
          )}

          {/* 批量生成 */}
          <div className="control-section">
            <h3>批量生成</h3>
            <button
              onClick={handleGenerateAll}
              disabled={isGenerating || jsonData.length === 0 || !htmlContent}
              className="btn btn-primary btn-generate"
            >
              {isGenerating ? "生成中..." : "一键生成所有 Banner"}
            </button>
            {isGenerating && (
              <div className="info-text">
                正在生成，请稍候...（浏览器可能会提示下载多个文件）
              </div>
            )}
          </div>

          {/* 使用说明 */}
          <div className="control-section">
            <h3>使用说明</h3>
            <div className="info-text">
              <p>1. 上传 ZIP 模板文件（包含 HTML、CSS 和图片）</p>
              <p>2. ZIP 中可包含 JSON 数据文件，会自动加载；也可单独上传 JSON 文件</p>
              <p>3. 使用左右按钮切换预览不同数据</p>
              <p>4. 点击"一键生成"批量导出 PNG</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
