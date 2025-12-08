import { ParsedSheet } from "./excelParser";

export type OfferSheetKind = "ROW_PER_SKU" | "UNKNOWN";

const NAME_COLUMNS = ["商品名称", "产品名称", "品名", "标题"];
const PRICE_COLUMNS = ["JD前台价", "前台价", "价格", "活动价", "单促价1"];
const BRIEF_COLUMNS = ["主图brief", "主图文案", "卖点", "权益"];
const SKU_COLUMNS = ["SKU", "SKU编码", "JD SKU编码", "商品编码", "产品编码"];  // 辅助判断字段

export interface OfferDetectionResult {
  kind: OfferSheetKind;
  nameColumn?: string;
  priceColumn?: string;
  briefColumn?: string;
  headerRowIndex?: number;  // 找到的表头行号
}

// 扫描可见行的前5行，找到包含所有必需字段的表头行
export function detectOfferSheet(sheet: ParsedSheet): OfferDetectionResult {
  const MAX_SCAN_ROWS = 5; // 只扫描可见行的前5行
  const rawRows = sheet.rawRows || [];

  console.log("开始扫描表头（只扫描可见行的前5行），rawRows 数量:", rawRows.length);
  
  // 扫描可见行的前5行，找到包含所有必需字段的行
  for (let rowIndex = 0; rowIndex < Math.min(MAX_SCAN_ROWS, rawRows.length); rowIndex++) {
    const row = rawRows[rowIndex];
    if (!Array.isArray(row) || row.length === 0) {
      continue;
    }

    // 将这一行转换为字符串数组（表头候选）
    const candidateHeaders = row.map((cell: any) => String(cell || "").trim());
    
    console.log(`扫描第 ${rowIndex + 1} 行（索引 ${rowIndex}）:`, candidateHeaders.slice(0, 10)); // 只打印前10个字段

    // 检查这一行是否包含必需的字段
    const nameColumn = NAME_COLUMNS.find(c => candidateHeaders.includes(c));
    const priceColumn = PRICE_COLUMNS.find(c => candidateHeaders.includes(c));
    const briefColumn = BRIEF_COLUMNS.find(c => candidateHeaders.includes(c));
    const skuColumn = SKU_COLUMNS.find(c => candidateHeaders.includes(c));
    
    console.log(`  第 ${rowIndex + 1} 行匹配结果:`, {
      nameColumn,
      priceColumn,
      briefColumn,
      skuColumn,
    });

    // 优先：商品名称 + 价格 + brief（完整匹配）
    if (nameColumn && priceColumn && briefColumn) {
      console.log(`✓ 找到完整匹配的表头行: 第 ${rowIndex + 1} 行（索引 ${rowIndex}）`);
      return {
        kind: "ROW_PER_SKU",
        nameColumn,
        priceColumn,
        briefColumn,
        headerRowIndex: rowIndex,
      };
    }
    
    // 备选：商品名称 + 价格 + SKU（如果没有 brief，但 SKU 可以作为标识）
    // 但要求 SKU 字段必须是 "JD SKU编码"，且价格字段必须是 "JD前台价"，这样更准确
    if (nameColumn && priceColumn && skuColumn) {
      // 更严格的判断：要求同时有 "JD SKU编码" 和 "JD前台价"，这样更可能是真正的表头行
      const hasJdSku = candidateHeaders.includes("JD SKU编码");
      const hasJdPrice = candidateHeaders.includes("JD前台价");
      
      if (hasJdSku && hasJdPrice) {
        console.log(`✓ 找到备选匹配的表头行（有JD SKU编码和JD前台价）: 第 ${rowIndex + 1} 行（索引 ${rowIndex}）`);
        const fallbackBriefColumn = BRIEF_COLUMNS.find(c => candidateHeaders.includes(c)) || undefined;
        return {
          kind: "ROW_PER_SKU",
          nameColumn,
          priceColumn,
          briefColumn: fallbackBriefColumn,  // 可能为 undefined
          headerRowIndex: rowIndex,
        };
      }
    }
  }

  // 如果扫描前10行都没找到，尝试使用默认的 headers（向后兼容）
  const headers = sheet.headers;
  const nameColumn = NAME_COLUMNS.find(c => headers.includes(c));
  const priceColumn = PRICE_COLUMNS.find(c => headers.includes(c));
  const briefColumn = BRIEF_COLUMNS.find(c => headers.includes(c));

  if (nameColumn && priceColumn && briefColumn) {
    return {
      kind: "ROW_PER_SKU",
      nameColumn,
      priceColumn,
      briefColumn,
      headerRowIndex: sheet.headerRowIndex || 0,
    };
  }

  return { kind: "UNKNOWN" };
}

