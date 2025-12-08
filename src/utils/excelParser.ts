import * as XLSX from "xlsx";

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  headerRowIndex: number;  // 表头所在的行号（0-based）
  rows: Record<string, any>[];  // 每一行是一个 { headerName: value }，只包含可见行
  rawRows: any[][];  // 原始行数据（二维数组），用于扫描表头，只包含可见行
}

/**
 * 获取第一个可见的 sheet 名称
 * 利用 workbook.Workbook.Sheets 里的 Hidden 属性：
 * - Hidden === 0 或 undefined → 可见
 * - Hidden === 1 或 2 → 隐藏 / veryHidden（忽略）
 */
export function getFirstVisibleSheetName(workbook: XLSX.WorkBook): string | undefined {
  const sheetMeta = workbook.Workbook?.Sheets || [];
  const sheetNames = workbook.SheetNames;

  for (let i = 0; i < sheetNames.length; i++) {
    const meta = sheetMeta[i];
    // Hidden: 0 = visible, 1 = hidden, 2 = veryHidden
    if (!meta || meta.Hidden === 0) {
      return sheetNames[i];
    }
  }

  return undefined;
}

/**
 * 将 sheet 转换为 JSON，只保留可见的行
 * SheetJS 会在 sheet["!rows"] 里标记每一行是否隐藏
 * 
 * 注意：XLSX 的 header 参数只支持 1（第一行作为表头），不支持其他数字值
 * 如果 headerRowIndex !== 0，应该使用手动映射的方式（见 BannerBatchPage.tsx）
 * 
 * @param sheet - Excel sheet 对象
 * @param headerRowIndex - 表头所在的行号（0-based）。只支持 0（第一行），其他值会导致返回空数组
 * @returns 转换后的 JSON 数据数组
 */
export function sheetToVisibleJson(sheet: XLSX.WorkSheet, headerRowIndex: number = 0): Record<string, any>[] {
  // XLSX 的 header 参数只支持 1（第一行作为表头），不支持其他数字值
  // 如果表头不在第一行，这个函数不应该被调用，应该使用手动映射
  if (headerRowIndex !== 0) {
    console.warn(`sheetToVisibleJson: headerRowIndex (${headerRowIndex}) is not 0. XLSX header parameter only supports 1. Returning empty array. Use manual mapping instead (see BannerBatchPage.tsx).`);
    return []; // 返回空数组，因为数据会在 BannerBatchPage 中重新解析
  }

  // 先把整张表转成 json 行，使用 header: 1（第一行作为表头）
  const allRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: "",
    header: 1,  // XLSX 只支持 1（第一行作为表头）
  });

  // 按 rowIndex 对应 !rows 的索引过滤（只保留可见行）
  const visibleRows = allRows.filter((_, rowIndex) => {
    // rowIndex 是 allRows 数组中的索引，需要转换为实际 sheet 中的行号
    // allRows 是从第 2 行开始的数据行（因为 header: 1 表示第一行是表头）
    const actualRowIndex = 1 + rowIndex; // header: 1 意味着数据从第 2 行开始（索引 1）
    const rowMeta = sheet["!rows"]?.[actualRowIndex];
    const isHidden = rowMeta && rowMeta.hidden;
    return !isHidden;
  });

  return visibleRows;
}

/**
 * 将 sheet 转换为原始二维数组，只保留可见的行
 */
export function sheetToVisibleRawRows(sheet: XLSX.WorkSheet, maxRows: number = 10): any[][] {
  // 先把整张表转成二维数组
  const allRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    defval: "",
    header: 1,  // 返回数组形式
  }) as any[][];

  // 过滤可见行
  const visibleRows = allRows.filter((_, rowIndex) => {
    const rowMeta = sheet["!rows"]?.[rowIndex];
    const isHidden = rowMeta && rowMeta.hidden;
    return !isHidden;
  });

  return visibleRows.slice(0, maxRows);
}

/**
 * 读取 Excel 文件，选取"第一个可见 sheet"，并返回已过滤隐藏行的结果
 */
export function parseFirstVisibleSheet(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        console.log("Excel 文件中的所有 Sheet:", workbook.SheetNames);
        
        // 获取第一个可见的 sheet
        const sheetName = getFirstVisibleSheetName(workbook);
        if (!sheetName) {
          throw new Error("No visible sheet found in workbook");
        }
        
        console.log("使用 Sheet (第一个可见的):", sheetName);
        const sheet = workbook.Sheets[sheetName];

        // 先获取所有可见的原始数据（二维数组形式），用于扫描表头
        // 注意：这里需要获取所有可见行，以便正确计算表头行在可见行中的索引
        const allVisibleRawRows = sheetToVisibleRawRows(sheet, 1000); // 获取足够多的可见行用于扫描
        
        // 扫描可见行的前5行，找到表头行
        const MAX_HEADER_SCAN_ROWS = 5;
        const rawRows = allVisibleRawRows.slice(0, MAX_HEADER_SCAN_ROWS); // 只取前5行用于扫描
        
        let headerRowIndex = 0;
        let headers: string[] = [];

        // 将每一行转换为字符串数组，用于匹配（只扫描可见行的前5行）
        for (let i = 0; i < Math.min(MAX_HEADER_SCAN_ROWS, rawRows.length); i++) {
          const row = rawRows[i];
          if (Array.isArray(row) && row.length > 0) {
            // 将这一行转换为字符串数组（表头候选）
            const candidateHeaders = row.map((cell: any) => String(cell || "").trim());
            headers = candidateHeaders;
            headerRowIndex = i; // 这是在可见行中的索引
            break;  // 先默认用第一行，后续在 detectOfferSheet 中会重新扫描
          }
        }

        // 注意：headerRowIndex 现在是可见行中的索引，但 sheetToVisibleJson 需要的是原始行号
        // 我们需要找到表头行在原始 sheet 中的实际行号
        // 由于 rawRows 已经是可见行，我们需要找到对应的原始行号
        // 但为了简化，我们先用可见行中的索引，在 sheetToVisibleJson 中会处理
        
        // 获取所有可见行的原始行号映射
        const allRawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
          defval: "",
          header: 1,
        }) as any[][];
        
        // 找到表头行在原始 sheet 中的实际行号
        let actualHeaderRowIndex = 0;
        let visibleRowCount = 0;
        for (let i = 0; i < allRawRows.length; i++) {
          const rowMeta = sheet["!rows"]?.[i];
          const isHidden = rowMeta && rowMeta.hidden;
          if (!isHidden) {
            if (visibleRowCount === headerRowIndex) {
              actualHeaderRowIndex = i;
              break;
            }
            visibleRowCount++;
          }
        }
        
        console.log("表头行在可见行中的索引:", headerRowIndex, "在原始 sheet 中的行号:", actualHeaderRowIndex);
        
        // 使用 sheetToVisibleJson 获取可见行（已过滤隐藏行）
        const json = sheetToVisibleJson(sheet, actualHeaderRowIndex);
        
        console.log("初始解析：可见行数:", json.length);

        resolve({
          sheetName,
          headers,
          headerRowIndex: actualHeaderRowIndex, // 保存原始行号，用于后续重新解析
          rows: json,
          rawRows: rawRows,  // 已经是可见行的前5行
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 保持向后兼容，parseFirstSheet 调用 parseFirstVisibleSheet
export function parseFirstSheet(file: File): Promise<ParsedSheet> {
  return parseFirstVisibleSheet(file);
}
