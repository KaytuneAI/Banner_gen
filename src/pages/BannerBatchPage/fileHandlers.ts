/**
 * 文件上传处理函数
 */
import { TemplateField } from "./types";
import { extractCssFromHtml } from "./htmlUtils";

/**
 * 处理 HTML 文件上传
 */
export const handleHtmlUpload = async (
  file: File,
  onSuccess: (result: {
    html: string;
    css?: string;
    fields: TemplateField[];
    successMessage: string;
  }) => void,
  onError: (message: string) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
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

        // 3. 自动提取 HTML 中的 CSS
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
          
          if (extractedCss) {
            successMsg += `，已自动提取 ${cssInfo.join(" 和 ")}`;
          } else if (hasLinkCss) {
            successMsg += `，检测到外部 CSS 链接`;
          }
        }

        onSuccess({
          html: rawHtml,
          css: extractedCss || undefined,
          fields: Array.from(fieldMap.values()),
          successMessage: successMsg,
        });
        
        resolve();
      } catch (err) {
        const message = err instanceof Error ? err.message : "HTML 文件读取失败";
        onError(message);
        reject(err);
      }
    };

    reader.onerror = () => {
      const message = "读取 HTML 文件时发生错误";
      onError(message);
      reject(new Error(message));
    };

    reader.readAsText(file, "utf-8");
  });
};

/**
 * 处理 CSS 文件上传
 */
export const handleCssUpload = async (
  file: File,
  onSuccess: (css: string, successMessage: string) => void,
  onError: (message: string) => void
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        onSuccess(text, `成功加载 CSS 样式: ${file.name}`);
        resolve();
      } catch (err) {
        const message = err instanceof Error ? err.message : "CSS 文件读取失败";
        onError(message);
        reject(err);
      }
    };

    reader.onerror = () => {
      const message = "读取 CSS 文件时发生错误";
      onError(message);
      reject(new Error(message));
    };

    reader.readAsText(file, "utf-8");
  });
};



