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

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- 关键修复：使所有相对路径映射到 public/banner_demo/ -->
    <base href="/banner_demo/">
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
    // 由于我们在 iframe 中使用 <base href="/banner_demo/">，link 标签的 href 会自动解析
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

  // 点击预览区域上传 HTML
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
    // 触发 HTML 文件选择（包括点击 placeholder 和空白区域）
    if (htmlInputRef.current) {
      htmlInputRef.current.click();
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
          
          // 获取价格值
          const signNode = priceEl.querySelector('.sign');
          const decimalNode = priceEl.querySelector('.decimal');
          const intValue = signNode?.nextSibling?.nodeValue || '';
          const decValue = decimalNode?.textContent || '';
          
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

          // 获取当前价格值
          const currentInt = priceEl.getAttribute('data-field-int') === 'sec_price_int' 
            ? (priceEl.querySelector('.sign')?.nextSibling?.nodeValue || '')
            : '';
          const currentDecimal = priceEl.querySelector('.decimal')?.textContent || '';
          
          // 更新对应的值
          if (fieldName === 'sec_price_int') {
            const signNode = priceEl.querySelector('.sign');
            if (signNode && signNode.nextSibling && signNode.nextSibling.nodeType === Node.TEXT_NODE) {
              signNode.nextSibling.nodeValue = newValue;
            }
          } else if (fieldName === 'sec_price_decimal') {
            const decimalNode = priceEl.querySelector('.decimal');
            if (decimalNode) {
              decimalNode.textContent = newValue.startsWith('.') ? newValue : '.' + newValue;
            }
          }

          // 更新显示值（组合整数和小数）
          const signNode = priceEl.querySelector('.sign');
          const decimalNode = priceEl.querySelector('.decimal');
          const intValue = signNode?.nextSibling?.nodeValue || '';
          const decValue = decimalNode?.textContent || '';
          setSelectedFieldValue(fieldName === 'sec_price_int' ? intValue : decValue);
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
  }, [currentIndex]);

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

  // 更新价格字段（特殊处理，因为价格结构特殊）
  const updatePriceFields = useCallback((iframeDoc: Document, intValue: string, decimalValue: string) => {
    const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
    if (!priceEl) return;

    const signNode = priceEl.querySelector('.sign');
    const decimalNode = priceEl.querySelector('.decimal');

    // 替换整数（sign 节点后的文本节点）
    if (signNode) {
      // 查找 sign 节点后的文本节点
      let textNode = signNode.nextSibling;
      while (textNode && textNode.nodeType !== Node.TEXT_NODE) {
        textNode = textNode.nextSibling;
      }
      
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        // 如果存在文本节点，直接更新
        textNode.nodeValue = intValue;
      } else {
        // 如果没有文本节点，创建一个并插入
        const newTextNode = iframeDoc.createTextNode(intValue);
        if (decimalNode) {
          priceEl.insertBefore(newTextNode, decimalNode);
        } else {
          priceEl.appendChild(newTextNode);
        }
      }
    }

    // 替换小数部分
    if (decimalNode) {
      decimalNode.textContent = decimalValue.startsWith('.')
        ? decimalValue
        : '.' + decimalValue;
    }
  }, []);

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

      // 遍历所有字段，更新对应元素（跳过价格字段，已特殊处理）
      Object.entries(data).forEach(([fieldName, value]) => {
        if (value === undefined || value === null) return;
        // 跳过价格字段
        if (fieldName === 'sec_price_int' || fieldName === 'sec_price_decimal') return;

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
      Object.entries(edits).forEach(([fieldName, value]) => {
        if (data[fieldName] === undefined && fieldName !== 'sec_price_int' && fieldName !== 'sec_price_decimal') {
          const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
          if (element) {
            if (element.tagName === "IMG") {
              (element as HTMLImageElement).src = value;
            } else {
              element.textContent = value;
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
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [jsonData, currentIndex, applyJsonDataToIframe, selectedField, editedValues]);

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

      for (let i = 0; i < jsonData.length; i++) {
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
        
        // 如果有 id，使用 id_时间戳，否则使用 banner_序号_时间戳
        const fileName = row.id 
          ? `${row.id}_${timestamp}.png`
          : `banner_${i + 1}_${timestamp}.png`;

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
        <h1>Kaytune FluidDAM - 广告模板批量编辑工具</h1>
        <p className="subtitle">上传 HTML/CSS 文件，实时预览模板效果</p>
      </div>

      <div className="banner-batch-content">
        {/* 左侧预览区 */}
        <div className="banner-preview-section">
          <div 
            className={`banner-preview-wrapper ${!htmlContent ? 'clickable-upload' : ''}`}
            onClick={handlePreviewAreaClick}
            title={htmlContent ? '' : '点击上传 HTML 模板'}
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
                <p>请先上传 HTML 模板文件</p>
                <p className="hint">点击此区域或下方按钮上传 HTML 文件</p>
              </div>
            )}
          </div>

          {/* 模板选择区域 */}
          <div className="template-selector">
            <h3>选择模板</h3>
            {htmlContent || cssContent ? (
              <div className="template-info">
                <div className="template-status">
                  <span className="template-status-icon">✓</span>
                  <span>已加载模板文件</span>
                </div>
                {htmlFileName && (
                  <div className="template-file-name">
                    <span>HTML: {htmlFileName}</span>
                    <button
                      onClick={handleClearHtml}
                      className="template-clear-btn"
                      title="清除 HTML"
                    >
                      ×
                    </button>
                  </div>
                )}
                {cssFileName && (
                  <div className="template-file-name">
                    <span>CSS: {cssFileName}</span>
                    <button
                      onClick={handleClearCss}
                      className="template-clear-btn"
                      title="清除 CSS"
                    >
                      ×
                    </button>
                  </div>
                )}
                {!htmlFileName && (
                  <div className="template-warning">
                    ⚠️ 请上传 HTML 模板（必需）
                  </div>
                )}
                <div className="template-actions">
                  {!htmlFileName && (
                    <label className="template-upload-label">
                      <input
                        ref={htmlInputRef}
                        type="file"
                        accept=".html,.htm,text/html"
                        onChange={handleHtmlUpload}
                        className="template-file-input"
                      />
                      <span className="btn btn-secondary btn-small">上传 HTML（必需）</span>
                    </label>
                  )}
                  {!cssFileName && (
                    <label className="template-upload-label">
                      <input
                        ref={cssInputRef}
                        type="file"
                        accept=".css,text/css"
                        onChange={handleCssUpload}
                        className="template-file-input"
                      />
                      <span className="btn btn-secondary btn-small">上传 CSS（可选）</span>
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <div className="template-upload-buttons">
                <div className="template-upload-item">
                  <label className="template-upload-label">
                    <input
                      ref={htmlInputRef}
                      type="file"
                      accept=".html,.htm,text/html"
                      onChange={handleHtmlUpload}
                      className="template-file-input"
                    />
                    <span className="btn btn-secondary btn-small">
                      上传 HTML <span className="required-mark">*</span>
                    </span>
                  </label>
                  <span className="template-upload-hint">必需</span>
                </div>
                <div className="template-upload-item">
                  <label className="template-upload-label">
                    <input
                      ref={cssInputRef}
                      type="file"
                      accept=".css,text/css"
                      onChange={handleCssUpload}
                      className="template-file-input"
                    />
                    <span className="btn btn-secondary btn-small">上传 CSS</span>
                  </label>
                  <span className="template-upload-hint">
                    可选（如果 HTML 中有内联样式可不上传）
                  </span>
                </div>
                <div className="template-hint">
                  <p>💡 提示：上传 HTML 文件后，预览将实时显示在左侧</p>
                  <p>💡 CSS 文件可选，用于外部样式表</p>
                </div>
              </div>
            )}
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
            <h3>上传批量替换文件(JSON格式)</h3>
            <label className="template-upload-label">
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleJsonUpload}
                className="file-input"
              />
              <span className="file-input-label">选择批量替换文件</span>
            </label>
            {jsonData.length > 0 && (
              <div className="info-text">
                已加载 <strong>{jsonData.length}</strong> 条数据
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
              <p>1. 上传 HTML 文件（必需）</p>
              <p>2. 可选上传 CSS 文件</p>
              <p>3. 上传 JSON 数据文件（包含多条数据，图片路径在 JSON 中指定）</p>
              <p>4. 使用左右按钮切换预览不同数据</p>
              <p>5. 点击"一键生成"批量导出 PNG</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
