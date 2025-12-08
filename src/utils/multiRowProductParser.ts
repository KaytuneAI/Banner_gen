import { ParsedSheet } from "./excelParser";
import { ProductBlock } from "../types";
import { findPriceColumn, findNameColumn } from "./offerDetector";

/**
 * 解析多行一个产品的 Excel（ADP 风格）
 * 核心逻辑：找到有价格的主行，然后向下收集价格为空但有明细信息的子行
 */
export function parseMultiRowProducts(parsed: ParsedSheet): ProductBlock[] {
  const priceCol = findPriceColumn(parsed.headers);
  const nameCol = findNameColumn(parsed.headers);
  if (!priceCol) return [];

  const blocks: ProductBlock[] = [];
  const rows = parsed.rows;

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const price = row[priceCol];

    if (!price || price === "" || price == null) {
      i++;
      continue;
    }

    const start = i;
    let end = i;

    // 向下收集子行：价格为空但有"明细/机制/类型/数量"等信息
    let j = i + 1;
    while (j < rows.length && (rows[j][priceCol] === "" || rows[j][priceCol] == null)) {
      const r = rows[j];
      const hasMechanismInfo =
        Object.keys(r).some(key =>
          key.includes("明细") || key.includes("机制") || key.includes("类型") || key.includes("数量")
        ) && Object.values(r).some(v => v !== "" && v != null);

      if (!hasMechanismInfo) break;

      end = j;
      j++;
    }

    const blockRows = [];
    for (let k = start; k <= end; k++) {
      blockRows.push({
        rowIndex: k,
        raw: rows[k],
      });
    }

    const baseRow = rows[start];

    const block: ProductBlock = {
      productId: `R${start}`,
      startRowIndex: start,
      endRowIndex: end,
      productName: nameCol ? baseRow[nameCol] : undefined,
      productDetail: baseRow["明细"] ?? baseRow["产品明细"],
      price,
      priceColumnName: priceCol,
      nameColumnName: nameCol,
      rows: blockRows,
    };

    blocks.push(block);
    i = end + 1;
  }

  return blocks;
}

