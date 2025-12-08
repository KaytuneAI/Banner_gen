import { ParsedSheet } from "./excelParser";
import { OfferDetectionResult } from "./offerDetector";

// 返回类型：直接使用 Excel 原始字段，不进行映射
export type ExcelRowData = Record<string, any>;

export function parseRowPerSkuSheet(
  sheet: ParsedSheet,
  detection: OfferDetectionResult
): ExcelRowData[] {
  if (detection.kind !== "ROW_PER_SKU" || !detection.nameColumn || !detection.priceColumn) {
    return [];
  }

  const { nameColumn } = detection;

  // 获取所有表头字段（从 sheet.headers 中获取，确保包含所有列）
  const allHeaders = sheet.headers || [];
  console.log("parseRowPerSkuSheet - 所有表头字段:", allHeaders.filter(h => h));
  console.log("parseRowPerSkuSheet - 表头字段数量:", allHeaders.filter(h => h).length);
  
  // 注意：sheet.rows 已经在 BannerBatchPage 中过滤了隐藏行
  return sheet.rows
    .filter(row => row[nameColumn]) // 过滤掉空行（商品名称为空的行）
    .map((row, index) => {
      // 创建一个新对象，只包含有值的字段
      const data: ExcelRowData = {
        _rowIndex: index, // 添加行索引，方便追踪
      };

      // 遍历所有表头字段，只添加有值的字段
      allHeaders.forEach((headerName) => {
        if (headerName) {  // 只处理有名称的列
          const value = row[headerName];
          // 如果值不为空，才添加（空值不包含）
          if (value !== null && value !== undefined && value !== "") {
            const stringValue = String(value).trim();
            if (stringValue !== "") {
              data[headerName] = value; // 保留原始类型（数字、字符串等）
            }
          }
        }
      });
      
      if (index === 0) {
        console.log("第一行解析后的字段:", Object.keys(data));
        console.log("第一行是否包含'主图brief':", '主图brief' in data);
      }

      return data;
    });
}

