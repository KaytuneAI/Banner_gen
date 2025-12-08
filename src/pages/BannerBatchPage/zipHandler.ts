/**
 * ZIP 文件处理逻辑
 */
import JSZip from "jszip";
import { BannerData } from "../../types";
import { TemplateField } from "./types";
import {
  replaceHtmlImgSrcWithBase64,
  replaceCssUrlWithBase64,
  buildInlineHtml,
} from "./htmlUtils";

export interface ZipProcessResult {
  html: string;
  css: string;
  fields: TemplateField[];
  jsonData: BannerData[];
  successMessage: string;
}

/**
 * 处理 ZIP 文件上传
 */
export const processZipFile = async (file: File): Promise<ZipProcessResult> => {
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
    throw new Error("ZIP 文件中未找到 HTML 文件");
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

    const normPath = fontEntry.name.replace(/^\.\//, "");
    fontMap[fontEntry.name] = dataUrl;
    fontMap[normPath] = dataUrl;
    fontMap["./" + normPath] = dataUrl;
    
    if (htmlDir && fontEntry.name.startsWith(htmlDirWithSlash)) {
      const relativePath = fontEntry.name.substring(htmlDir.length + 1);
      fontMap[relativePath] = dataUrl;
      fontMap["./" + relativePath] = dataUrl;
    }
    
    const fileName = normPath.split("/").pop() || normPath;
    if (fileName !== normPath) {
      fontMap[fileName] = dataUrl;
    }
  }

  // 5. 构建图片路径 -> Base64 data URL 映射
  const imageMap: Record<string, string> = {};
  for (const imgEntry of imageFiles) {
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

    const normPath = imgEntry.name.replace(/^\.\//, "");
    imageMap[imgEntry.name] = dataUrl;
    imageMap[normPath] = dataUrl;
    imageMap["./" + normPath] = dataUrl;
    
    if (htmlDir && imgEntry.name.startsWith(htmlDirWithSlash)) {
      const relativePath = imgEntry.name.substring(htmlDir.length + 1);
      imageMap[relativePath] = dataUrl;
      imageMap["./" + relativePath] = dataUrl;
    }
    
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

  // 9. 解析 data-field / data-label
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
  let processedJsonData: BannerData[] = [];
  if (jsonFiles.length > 0) {
    try {
      const preferredJsonNames = ["data.json", "test.json", "banner.json", "template.json"];
      let jsonEntry = jsonFiles.find((f) => 
        preferredJsonNames.some(name => f.name.toLowerCase().includes(name.toLowerCase()))
      ) || jsonFiles[0];

      const jsonText = await jsonEntry.async("text");
      const parsedJson = JSON.parse(jsonText);
      
      const processedJsonDataArray = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
      
      // 遍历 JSON 数据，替换图片路径为 Base64
      processedJsonData = processedJsonDataArray.map((item: BannerData) => {
        const processedItem: BannerData = { ...item };
        
        Object.keys(processedItem).forEach((key) => {
          const value = processedItem[key];
          
          if (Array.isArray(value)) {
            const processedArray = value.map((path: string) => {
              if (typeof path === "string" && path) {
                const normalizedPath = path.replace(/^\.\//, "");
                const base64Url = imageMap[path] || imageMap[normalizedPath] || imageMap["./" + normalizedPath] || imageMap[normalizedPath.split("/").pop() || ""];
                return base64Url || path;
              }
              return path;
            });
            processedItem[key] = processedArray;
          } else if (typeof value === "string" && value) {
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
      processedJsonData = [{} as BannerData, ...processedJsonData];
    } catch (jsonErr) {
      console.warn("解析 ZIP 中的 JSON 文件失败:", jsonErr);
      // 即使 JSON 解析失败，也要确保至少有一个模板占位符，以便显示 HTML 模板
      processedJsonData = [{} as BannerData];
    }
  }

  // 11. 构建成功消息
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

  return {
    html: finalHtml,
    css: processedCss, // 返回处理过的 CSS（字体路径已转换为 base64），用于注入顶层文档
    fields: Array.from(fieldMap.values()),
    jsonData: processedJsonData,
    successMessage: successMsg,
  };
};



