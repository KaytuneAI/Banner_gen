import { useState, useRef, useEffect, useCallback } from "react";
import { BannerData } from "../../../types";
import { TemplateField } from "../types";

/**
 * Banner 页面状态管理 Hook
 * 管理所有与 banner 相关的状态
 */
export function useBannerState() {
  // 模板内容状态
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [cssContent, setCssContent] = useState<string>("");
  const [htmlFileName, setHtmlFileName] = useState<string>("");
  const [cssFileName, setCssFileName] = useState<string>("");
  
  // UI 反馈状态
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  
  // 模板相关状态
  const [iframeSize, setIframeSize] = useState<{ width: number; height: number } | null>(null);
  const [templateFields, setTemplateFields] = useState<TemplateField[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedFieldValue, setSelectedFieldValue] = useState<string>("");
  
  // JSON 数据相关状态
  const [jsonData, setJsonData] = useState<BannerData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [editedValues, setEditedValues] = useState<Record<number, Record<string, string>>>({});
  
  // 单图/多图模式状态
  const [isMultiView, setIsMultiView] = useState<boolean>(false);
  const [selectedBannerIndex, setSelectedBannerIndex] = useState<number | null>(null);
  
  // 统一模板状态（用于一键保存判断）
  const [templateAssets, setTemplateAssets] = useState<{
    html: string;
    css: string;
    fields: TemplateField[];
    fileName: string;
  } | null>(null);
  
  // 2×2 预览网格相关状态
  const [gridWidth, setGridWidth] = useState(0);
  
  // Refs
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const cssInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const multiIframeRefs = useRef<(HTMLIFrameElement | null)[]>([null, null, null, null]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  
  // 用于在 onLoad 回调中访问最新的 currentIndex 和 jsonData，避免闭包捕获过时值
  const currentIndexRef = useRef(currentIndex);
  const jsonDataRef = useRef(jsonData);
  
  // 保持 ref 与 state 同步
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    jsonDataRef.current = jsonData;
  }, [jsonData]);
  
  // 获取当前活动的索引（单图用 currentIndex，多图用 selectedBannerIndex）
  const getActiveIndex = useCallback(() => {
    if (isMultiView) {
      return selectedBannerIndex ?? currentIndex;
    }
    return currentIndex;
  }, [isMultiView, selectedBannerIndex, currentIndex]);
  
  return {
    // 模板内容状态
    htmlContent,
    setHtmlContent,
    cssContent,
    setCssContent,
    htmlFileName,
    setHtmlFileName,
    cssFileName,
    setCssFileName,
    
    // UI 反馈状态
    error,
    setError,
    success,
    setSuccess,
    
    // 模板相关状态
    iframeSize,
    setIframeSize,
    templateFields,
    setTemplateFields,
    selectedField,
    setSelectedField,
    selectedFieldValue,
    setSelectedFieldValue,
    
    // JSON 数据相关状态
    jsonData,
    setJsonData,
    currentIndex,
    setCurrentIndex,
    isGenerating,
    setIsGenerating,
    editedValues,
    setEditedValues,
    
    // 单图/多图模式状态
    isMultiView,
    setIsMultiView,
    selectedBannerIndex,
    setSelectedBannerIndex,
    
    // 统一模板状态
    templateAssets,
    setTemplateAssets,
    
    // 2×2 预览网格相关状态
    gridWidth,
    setGridWidth,
    
    // Refs
    htmlInputRef,
    cssInputRef,
    jsonInputRef,
    zipInputRef,
    excelInputRef,
    iframeRef,
    previewIframeRef,
    multiIframeRefs,
    gridRef,
    currentIndexRef,
    jsonDataRef,
    
    // 工具函数
    getActiveIndex,
  };
}

