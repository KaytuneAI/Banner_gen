import { ParsedSheet } from "./excelParser";

export type OfferSheetKind = "ROW_PER_SKU" | "UNKNOWN";
export type SheetKind = "MULTIROW_PRODUCT" | "ROW_PER_SKU" | "UNKNOWN";

const NAME_COLUMNS = ["商品名称", "产品名称", "品名", "标题"];
const PRICE_COLUMNS = ["JD前台价", "前台价", "价格", "活动价", "单促价1"];
const BRIEF_COLUMNS = ["主图brief", "主图文案", "卖点", "权益"];
const SKU_COLUMNS = ["SKU", "SKU编码", "JD SKU编码", "商品编码", "产品编码"];  // 辅助判断字段

// 价格列关键词（用于多行产品检测）
const PRICE_HEADER_KEYWORDS = ["价格", "前台价", "促销价", "单促价", "SRP", "MSRP", "JD前台价", "活动价"];
// 名称列关键词（用于多行产品检测）
const NAME_HEADER_KEYWORDS = ["商品名称", "产品名称", "品名", "套装名称", "礼盒名称"];

/**
 * 查找价格列
 */
export function findPriceColumn(headers: string[]): string | undefined {
  return headers.find(h => PRICE_HEADER_KEYWORDS.some(k => h.includes(k)));
}

/**
 * 查找产品名称列
 */
export function findNameColumn(headers: string[]): string | undefined {
  return headers.find(h => NAME_HEADER_KEYWORDS.some(k => h.includes(k)));
}

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

/**
 * 通过价格模式判断 sheet 类型：多行一个产品 vs 一行一个产品
 * 核心逻辑：检查是否有"有价格的主行 + 没价格但有明细信息的子行"的结构
 */
export function detectSheetKindByPricePattern(parsed: ParsedSheet): SheetKind {
  const priceCol = findPriceColumn(parsed.headers);
  console.log("detectSheetKindByPricePattern - headers:", parsed.headers);
  console.log("detectSheetKindByPricePattern - 找到的价格列:", priceCol);
  if (!priceCol) {
    console.log("detectSheetKindByPricePattern - 未找到价格列，返回 UNKNOWN");
    return "UNKNOWN";
  }

  const rows = parsed.rows;
  console.log("detectSheetKindByPricePattern - 数据行数:", rows.length);
  if (rows.length === 0) {
    console.log("detectSheetKindByPricePattern - 没有数据行，返回 UNKNOWN");
    return "UNKNOWN";
  }
  
  // 检查第一行数据，看看价格列是否存在
  console.log("detectSheetKindByPricePattern - 第一行数据:", rows[0]);
  console.log("detectSheetKindByPricePattern - 第一行数据的所有字段:", Object.keys(rows[0] || {}));
  console.log("detectSheetKindByPricePattern - 第一行数据的价格列值:", rows[0]?.[priceCol]);
  
  let multiRowBlockCount = 0;
  let singleRowCount = 0;

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const hasPrice = row[priceCol] !== "" && row[priceCol] != null && row[priceCol] !== undefined;

    if (!hasPrice) {
      i++;
      continue;
    }

    // 从这一行往下看看有没有"子行"（价格为空但有其它信息）
    let j = i + 1;
    let hasChildRow = false;

    while (j < rows.length && (rows[j][priceCol] === "" || rows[j][priceCol] == null)) {
      const r = rows[j];

      // 是否有明细/机制/类型/数量这类信息（很粗的判断即可）
      const hasMechanismInfo =
        Object.keys(r).some(key =>
          key.includes("明细") || key.includes("机制") || key.includes("类型") || key.includes("数量")
        ) && Object.values(r).some(v => v !== "" && v != null);

      if (!hasMechanismInfo) break;

      hasChildRow = true;
      j++;
    }

    if (hasChildRow) {
      multiRowBlockCount++;
      i = j;
    } else {
      singleRowCount++;
      i++;
    }
  }

  // 有明显"主行+子行"的结构，认为是 ADP 风格
  if (multiRowBlockCount >= 1 && multiRowBlockCount >= singleRowCount) {
    return "MULTIROW_PRODUCT";
  }

  // 大多数有价格的行都是单行，就当成一行一个产品
  if (singleRowCount > 0) {
    return "ROW_PER_SKU";
  }

  return "UNKNOWN";
}

