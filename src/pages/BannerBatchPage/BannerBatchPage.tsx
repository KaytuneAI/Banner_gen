import React, { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import { parseJsonFile } from "../../utils/fileHelpers";
import { exportNodeToPngDataUrl } from "../../utils/htmlExport";
import { BannerData } from "../../types";
import { TemplateField } from "./types";
import { buildSrcDoc, extractCssFromHtml } from "./htmlUtils";
import { processZipFile } from "./zipHandler";
import { handleHtmlUpload as handleHtmlUploadUtil, handleCssUpload as handleCssUploadUtil } from "./fileHandlers";
import { applyJsonDataToIframe as applyJsonDataToIframeUtil, applyJsonDataToMultiIframe as applyJsonDataToMultiIframeUtil, updatePriceFields } from "./dataApplier";
import "./BannerBatchPage.css";

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
  
  // 单图/多图模式状态
  const [isMultiView, setIsMultiView] = useState<boolean>(false);

  const htmlInputRef = useRef<HTMLInputElement>(null);
  const cssInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // 多图模式的4个iframe ref
  const multiIframeRefs = useRef<(HTMLIFrameElement | null)[]>([null, null, null, null]);


  // 处理 HTML 文件上传
  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    handleHtmlUploadUtil(
      file,
      (result) => {
        setTemplateFields(result.fields);
        setHtmlContent(result.html);
        setHtmlFileName(file.name);
        if (result.css && !cssContent) {
          setCssContent(result.css);
        }
        setSuccess(result.successMessage);
        if (htmlInputRef.current) {
          htmlInputRef.current.value = "";
        }
      },
      (message) => {
        setError(message);
        if (htmlInputRef.current) {
          htmlInputRef.current.value = "";
        }
      }
    );
  };

  // 处理 CSS 文件上传
  const handleCssUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    handleCssUploadUtil(
      file,
      (css, successMessage) => {
        setCssContent(css);
        setCssFileName(file.name);
        setSuccess(successMessage);
        if (cssInputRef.current) {
          cssInputRef.current.value = "";
        }
      },
      (message) => {
        setError(message);
        if (cssInputRef.current) {
          cssInputRef.current.value = "";
        }
      }
    );
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


  // 处理 ZIP 文件上传
  const handleZipUpload = async (file: File | null) => {
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const result = await processZipFile(file);
      
      setTemplateFields(result.fields);
      setHtmlContent(result.html);
      setCssContent(result.css);
      setHtmlFileName(file.name);
      setCssFileName("");
      
      if (result.jsonData.length > 0) {
        setJsonData(result.jsonData);
        setCurrentIndex(0);
      }
      
      setSuccess(result.successMessage);
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
  // updatePriceFields 已移至 dataApplier.ts，直接使用导入的函数

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

  // applyJsonDataToMultiIframe 已移至 dataApplier.ts，使用导入的函数
  const applyJsonDataToMultiIframeWrapper = useCallback((iframe: HTMLIFrameElement, data: BannerData, index: number) => {
    if (!iframe || !htmlContent) return;
    applyJsonDataToMultiIframeUtil(iframe, data, index, editedValues);
  }, [htmlContent, editedValues]);

  // applyJsonDataToIframe 已移至 dataApplier.ts，使用导入的函数
  const applyJsonDataToIframe = useCallback((data: BannerData, index: number) => {
    if (!iframeRef.current || !htmlContent) return;
    applyJsonDataToIframeUtil(iframeRef.current, data, index, editedValues);
  }, [htmlContent, editedValues]);

  // 多图模式：更新4个iframe的数据
  useEffect(() => {
    if (isMultiView && jsonData.length > 0 && htmlContent) {
      const timer = setTimeout(() => {
        [0, 1, 2, 3].forEach((idx) => {
          const dataIndex = currentIndex + idx;
          if (dataIndex < jsonData.length && multiIframeRefs.current[idx]) {
            const iframe = multiIframeRefs.current[idx];
            if (iframe) {
              applyJsonDataToMultiIframeWrapper(iframe, jsonData[dataIndex], dataIndex);
            }
          }
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMultiView, jsonData, currentIndex, htmlContent, applyJsonDataToMultiIframeWrapper]);

  // 当前数据变化时，应用到 iframe（单图模式）
  useEffect(() => {
    if (!isMultiView && jsonData.length > 0 && currentIndex >= 0 && currentIndex < jsonData.length) {
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
    const step = isMultiView ? 4 : 1;
    if (currentIndex >= step) {
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
      setCurrentIndex(currentIndex - step);
    } else if (currentIndex > 0) {
      // 如果不足4步，至少回到0
      if (selectedField && selectedFieldValue) {
        setEditedValues(prev => ({
          ...prev,
          [currentIndex]: {
            ...prev[currentIndex],
            [selectedField]: selectedFieldValue
          }
        }));
      }
      setCurrentIndex(0);
    }
  };

  // 切换到下一条
  const handleNext = () => {
    const step = isMultiView ? 4 : 1;
    const maxIndex = isMultiView 
      ? Math.max(0, jsonData.length - 4)  // 多图模式：确保最后4个都能显示
      : jsonData.length - 1;
    
    if (currentIndex < maxIndex) {
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
      setCurrentIndex(Math.min(currentIndex + step, maxIndex));
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
          {!isMultiView ? (
            // 单图模式
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
          ) : (
            // 多图模式：4个画布（2x2布局）
            <div className="multi-preview-grid">
              {[0, 1, 2, 3].map((idx) => {
                const dataIndex = currentIndex + idx;
                const hasData = jsonData.length > 0 && dataIndex < jsonData.length;
                const displayIndex = hasData ? dataIndex : currentIndex;
                
                return (
                  <div key={idx} className="multi-preview-item">
                    <div className="multi-preview-label">
                      {hasData ? `图 ${idx + 1} (${displayIndex + 1}/${jsonData.length})` : `图 ${idx + 1}`}
                    </div>
                    {htmlContent ? (
                      <iframe
                        ref={(el) => {
                          multiIframeRefs.current[idx] = el;
                        }}
                        title={`banner-preview-${idx}`}
                        className="preview-iframe multi-preview-iframe"
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
                        onLoad={(e) => {
                          const iframe = e.currentTarget;
                          if (idx === 0) {
                            adjustIframeSize();
                          }
                          // 延迟应用数据，确保iframe已完全加载
                          setTimeout(() => {
                            if (hasData && jsonData[displayIndex]) {
                              applyJsonDataToMultiIframeWrapper(iframe, jsonData[displayIndex], displayIndex);
                            }
                          }, 100);
                        }}
                      />
                    ) : (
                      <div className="banner-placeholder">
                        <p>上传 ZIP 模板文件</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 模板选择区域 */}
          <div className="template-selector">
            <h3>选择模板</h3>
            
            <div className="template-selector-content">
              {/* ZIP 上传区域（左侧一半） */}
              <div className="template-upload-section template-upload-left">
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

              {/* 单图/多图切换（右侧一半） */}
              <div className="template-view-mode-section">
                <h3>预览模式</h3>
                <div className="view-mode-toggle">
                  <button
                    className={`view-mode-btn ${!isMultiView ? 'active' : ''}`}
                    onClick={() => setIsMultiView(false)}
                  >
                    单图
                  </button>
                  <button
                    className={`view-mode-btn ${isMultiView ? 'active' : ''}`}
                    onClick={() => setIsMultiView(true)}
                  >
                    多图
                  </button>
                </div>
                <p className="view-mode-hint">
                  {isMultiView ? '显示4个画布（2x2布局）' : '显示单个画布'}
                </p>
              </div>
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
                  ← {isMultiView ? '上4条' : '上一条'}
                </button>
                <span className="preview-index">
                  {isMultiView ? (
                    <>
                      {currentIndex + 1}-{Math.min(currentIndex + 4, jsonData.length)} / {jsonData.length}
                      <span className="preview-mode-badge">多图</span>
                    </>
                  ) : (
                    <>
                      {currentIndex + 1} / {jsonData.length}
                    </>
                  )}
                </span>
                <button
                  onClick={handleNext}
                  disabled={isMultiView 
                    ? currentIndex >= Math.max(0, jsonData.length - 4)
                    : currentIndex === jsonData.length - 1
                  }
                  className="btn btn-secondary"
                >
                  {isMultiView ? '下4条' : '下一条'} →
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
