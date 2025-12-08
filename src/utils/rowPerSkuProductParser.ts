import { ParsedSheet } from "./excelParser";
import { ProductBlock } from "../types";
import { findPriceColumn, findNameColumn } from "./offerDetector";

/**
 * 解析一行一个产品的 Excel（旁氏风格）
 * 每一行生成一个 ProductBlock
 */
export function parseRowPerSkuProducts(parsed: ParsedSheet): ProductBlock[] {
  const priceCol = findPriceColumn(parsed.headers);
  const nameCol = findNameColumn(parsed.headers);
  if (!priceCol || !nameCol) return [];

  return parsed.rows
    .map((row, index) => {
      const hasPrice = row[priceCol] !== "" && row[priceCol] != null;
      const hasName = row[nameCol] !== "" && row[nameCol] != null;
      if (!hasPrice && !hasName) return null;

      const block: ProductBlock = {
        productId: `R${index}`,
        startRowIndex: index,
        endRowIndex: index,
        productName: row[nameCol],
        productDetail: row["容量"] ?? row["规格"],
        price: row[priceCol],
        priceColumnName: priceCol,
        nameColumnName: nameCol,
        rows: [
          {
            rowIndex: index,
            raw: row,
          },
        ],
      };

      return block;
    })
    .filter((block): block is ProductBlock => block !== null);
}

