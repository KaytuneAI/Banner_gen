// 灵活的数据类型，支持任意字段
export type BannerData = Record<string, string | number | string[] | undefined> & {
  id?: string;  // 用于命名输出文件（可选）
  // 支持数组类型的图片字段
  product_main_src?: string | string[];  // 主产品图片（支持单张或多张）
  product_main_qty?: number;  // 主产品数量（如果存在，会复制 product_main_src 对应次数）
  gift_products_src?: string | string[];  // 赠品图片（支持单张或多张）
  gift_products_qty?: number;  // 赠品数量（配合 gift_products_src 使用）
  gift_products_src_1?: string;  // 第一张赠品图片
  gift_products_qty_1?: number;  // 第一组赠品数量（如果存在，会复制 gift_products_src_1 对应次数）
};

// 兼容旧版本的 BannerFields
export type BannerFields = BannerData;

