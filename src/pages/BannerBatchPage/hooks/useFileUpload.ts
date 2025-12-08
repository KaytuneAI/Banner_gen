import { useCallback } from "react";
import { processZipFile } from "../zipHandler";
import { handleHtmlUpload as handleHtmlUploadUtil, handleCssUpload as handleCssUploadUtil } from "../fileHandlers";
import { parseFirstSheet, ParsedSheet, getFirstVisibleSheetName } from "../../../utils/excelParser";
import { detectOfferSheet } from "../../../utils/offerDetector";
import { parseRowPerSkuSheet } from "../../../utils/offerRowPerSkuParser";
import { parseJsonFile } from "../../../utils/fileHelpers";
import type { ReturnType } from "react";

/**
 * 文件上传处理 Hook
 * 处理所有文件上传相关的逻辑
 */
export function useFileUpload(state: ReturnType<typeof import("./useBannerState").useBannerState>) {
  const {
    setError,
    setSuccess,
    setHtmlContent,
    setCssContent,
    setHtmlFileName,
    setCssFileName,
    setTemplateFields,
    setTemplateAssets,
    setJsonData,
    setCurrentIndex,
    setSelectedBannerIndex,
    htmlInputRef,
    cssInputRef,
    jsonInputRef,
    zipInputRef,
    excelInputRef,
    htmlContent,
    cssContent,
    isMultiView,
  } = state;

  // 处理 HTML 文件上传
  const handleHtmlUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
        setTemplateAssets({
          html: result.html,
          css: result.css || "",
          fields: result.fields,
          fileName: file.name,
        });
        setJsonData([]);
        setCurrentIndex(0);
        setSelectedBannerIndex(null);
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
  }, [setError, setSuccess, setTemplateFields, setHtmlContent, setHtmlFileName, setCssContent, setTemplateAssets, setJsonData, setCurrentIndex, setSelectedBannerIndex, htmlInputRef, cssContent]);

  // 处理 CSS 文件上传
  const handleCssUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [setError, setSuccess, setCssContent, setCssFileName, cssInputRef]);

  // 清除 HTML
  const handleClearHtml = useCallback(() => {
    setHtmlContent("");
    setHtmlFileName("");
    setTemplateFields([]);
    state.setSelectedField(null);
    state.setSelectedFieldValue("");
    setTemplateAssets(null);
    setSuccess("已清除 HTML 模板");
  }, [setHtmlContent, setHtmlFileName, setTemplateFields, setTemplateAssets, setSuccess, state]);

  // 处理 ZIP 文件上传
  const handleZipUpload = useCallback(async (file: File | null) => {
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
      
      setTemplateAssets({
        html: result.html,
        css: result.css,
        fields: result.fields,
        fileName: file.name,
      });
      
      if (result.jsonData.length > 0) {
        setJsonData(result.jsonData);
        setCurrentIndex(0);
        setSelectedBannerIndex(isMultiView ? 0 : null);
      } else {
        setJsonData([]);
        setCurrentIndex(0);
        setSelectedBannerIndex(null);
      }
      
      setSuccess(result.successMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : "ZIP 文件处理失败";
      setError(message);
      console.error("ZIP 处理错误:", err);
    }

    if (zipInputRef.current) {
      zipInputRef.current.value = "";
    }
  }, [setError, setSuccess, setTemplateFields, setHtmlContent, setCssContent, setHtmlFileName, setCssFileName, setTemplateAssets, setJsonData, setCurrentIndex, setSelectedBannerIndex, isMultiView, zipInputRef]);

  // 处理 Excel 上传（简化版，完整逻辑在主文件中）
  const handleExcelUpload = useCallback(async (file: File | null) => {
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const parsedSheet = await parseFirstSheet(file);
      const detection = detectOfferSheet(parsedSheet);

      if (detection.kind === "UNKNOWN") {
        setError("未识别为可用的 offer 编排表（ROW_PER_SKU），请检查表头字段。已扫描前10行。");
        return;
      }

      // 简化处理：如果表头不在第一行，需要重新解析
      let finalParsedSheet = parsedSheet;
      if (detection.headerRowIndex !== undefined && detection.headerRowIndex !== 0) {
        // 重新解析逻辑（完整版在主文件中）
        const XLSX = await import("xlsx");
        const reader = new FileReader();
        finalParsedSheet = await new Promise<ParsedSheet>((resolve, reject) => {
          reader.onload = (e) => {
            try {
              const data = new Uint8Array(e.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, { type: "array" });
              const targetSheetName = getFirstVisibleSheetName(workbook);
              if (!targetSheetName) {
                throw new Error("No visible sheet found in workbook");
              }
              const sheet = workbook.Sheets[targetSheetName];
              const allRawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
                defval: "",
                header: 1,
              }) as any[][];
              
              let actualHeaderRowIndex = 0;
              let visibleRowCount = 0;
              for (let i = 0; i < allRawRows.length; i++) {
                const rowMeta = sheet["!rows"]?.[i];
                const isHidden = rowMeta && rowMeta.hidden;
                if (!isHidden) {
                  if (visibleRowCount === detection.headerRowIndex!) {
                    actualHeaderRowIndex = i;
                    break;
                  }
                  visibleRowCount++;
                }
              }
              
              const headerRow = allRawRows[actualHeaderRowIndex];
              const headerRowValues = headerRow ? headerRow.map((cell: any) => String(cell || "").trim()) : [];
              
              const dataStartRow = actualHeaderRowIndex + 1;
              const mappedJson = allRawRows
                .map((row, rowIndex) => ({ row, rowIndex }))
                .filter(({ row, rowIndex }) => {
                  if (rowIndex <= actualHeaderRowIndex) return false;
                  const rowMeta = sheet["!rows"]?.[rowIndex];
                  const isHidden = rowMeta && rowMeta.hidden;
                  return !isHidden;
                })
                .map(({ row, rowIndex }) => {
                  const mappedRow: Record<string, any> = {};
                  const fieldValuesByCol: Array<{ headerName: string; value: any; colIdx: number }> = [];
                  
                  for (let colIdx = 0; colIdx < headerRowValues.length; colIdx++) {
                    const headerName = headerRowValues[colIdx];
                    if (headerName) {
                      const cellValue = colIdx < row.length ? row[colIdx] : undefined;
                      const hasValue = cellValue !== null && cellValue !== undefined && cellValue !== "" && String(cellValue).trim() !== "";
                      fieldValuesByCol.push({ headerName, value: cellValue, colIdx });
                    }
                  }
                  
                  const fieldNameCount = new Map<string, number>();
                  const fieldNameIndices = new Map<string, number[]>();
                  
                  fieldValuesByCol.forEach(({ headerName, colIdx }) => {
                    const count = fieldNameCount.get(headerName) || 0;
                    fieldNameCount.set(headerName, count + 1);
                    if (!fieldNameIndices.has(headerName)) {
                      fieldNameIndices.set(headerName, []);
                    }
                    fieldNameIndices.get(headerName)!.push(colIdx);
                  });
                  
                  fieldValuesByCol.forEach(({ headerName, value, colIdx }) => {
                    const hasValue = value !== null && value !== undefined && value !== "" && String(value).trim() !== "";
                    if (!hasValue) return;
                    
                    let finalFieldName = headerName;
                    const count = fieldNameCount.get(headerName)!;
                    
                    if (count > 1) {
                      const indices = fieldNameIndices.get(headerName)!;
                      const position = indices.indexOf(colIdx);
                      const otherValues = indices
                        .filter(idx => idx !== colIdx)
                        .map(idx => {
                          const item = fieldValuesByCol.find(f => f.colIdx === idx && f.headerName === headerName);
                          return item ? item.value : null;
                        })
                        .filter(v => v !== null && v !== undefined && v !== "" && String(v).trim() !== "");
                      
                      if (otherValues.length > 0) {
                        finalFieldName = `${headerName}${position + 1}`;
                      }
                    }
                    
                    mappedRow[finalFieldName] = value;
                  });
                  
                  mappedRow['_rowIndex'] = rowIndex - dataStartRow;
                  return mappedRow;
                });
              
              resolve({
                sheetName: targetSheetName,
                headers: headerRowValues,
                headerRowIndex: actualHeaderRowIndex,
                rows: mappedJson,
                rawRows: parsedSheet.rawRows,
              });
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
      }

      const excelData = parseRowPerSkuSheet(finalParsedSheet, detection);

      if (excelData.length === 0) {
        const rowCount = finalParsedSheet.rows.length;
        const nameColumn = detection.nameColumn;
        const nonEmptyRows = finalParsedSheet.rows.filter(row => row[nameColumn || ""]).length;
        setError(`未能从 Excel 中提取到有效数据。总行数: ${rowCount}，包含"${nameColumn}"的行数: ${nonEmptyRows}。请检查数据行或表头识别是否正确。`);
        return;
      }

      const headerInfo = detection.headerRowIndex !== undefined && detection.headerRowIndex > 0 
        ? `（表头在第${detection.headerRowIndex + 1}行）`
        : "";
      setSuccess(`成功解析 ${excelData.length} 条数据（ROW_PER_SKU 模式${headerInfo}）`);

      // 自动下载 JSON 文件
      try {
        const jsonString = JSON.stringify(excelData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const originalFileName = file.name.replace(/\.[^/.]+$/, "");
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        link.download = `${originalFileName}_BannerRenderData_${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (downloadErr) {
        console.warn("下载 JSON 文件失败:", downloadErr);
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : "Excel 文件处理失败";
      setError(message);
      console.error("Excel 处理错误:", err);
    }

    if (excelInputRef.current) {
      excelInputRef.current.value = "";
    }
  }, [setError, setSuccess, excelInputRef]);

  // 处理 JSON 文件上传
  const handleJsonUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");

    try {
      const data = await parseJsonFile(file);
      const jsonArray = Array.isArray(data) ? data : [data];
      setJsonData(jsonArray);
      setCurrentIndex(0);
      setSelectedBannerIndex(null);
      setSuccess(`成功加载 JSON 数据: ${jsonArray.length} 条记录`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "JSON 文件解析失败";
      setError(message);
    }

    if (jsonInputRef.current) {
      jsonInputRef.current.value = "";
    }
  }, [setError, setSuccess, setJsonData, setCurrentIndex, setSelectedBannerIndex, jsonInputRef]);

  // 点击预览区域上传 ZIP
  const handlePreviewAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (htmlContent) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'IFRAME') return;
    if (zipInputRef.current) {
      zipInputRef.current.click();
    }
  }, [htmlContent, zipInputRef]);

  return {
    handleHtmlUpload,
    handleCssUpload,
    handleClearHtml,
    handleZipUpload,
    handleExcelUpload,
    handleJsonUpload,
    handlePreviewAreaClick,
  };
}

