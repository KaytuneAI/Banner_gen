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

// Banner 渲染数据结构（用于 Excel 解析）
export interface BannerRenderData {
  id: string;                 // 一行的唯一ID，可用品牌+SKU编码
  templateId: string;         // 先填死，比如 "DEFAULT" 或按品牌填写

  productTitle: string;       // 商品标题：品牌 + 商品名
  productSubtitle: string;    // 规格、卖点短补充（可为空）
  priceMain: string;          // 主价格文本，例如 "¥39.9"
  priceTag?: string;          // 价格补充，如 "单件直降"（可选）
  couponText?: string;        // 券说明一句话（可选）

  benefitTitle: string;       // 主利益点标题，用于 banner 主文案
  benefitLine1?: string;      // 权益行1，例如 "买1赠：xxx"
  benefitLine2?: string;      // 权益行2
  benefitLine3?: string;      // 权益行3

  cornerTag?: string;         // 角标，如 "新品"、"爆款"（可选）
  
  // 保留所有原始字段，以便后续使用
  rawData?: Record<string, any>;  // 包含所有原始Excel字段，如"单促价1"、"时间"、"主图brief"等
}

// 产品块结构（用于多行产品解析）
export interface ProductBlock {
  productId: string;                 // 用行号/序号/SKU 拼出的唯一 id
  startRowIndex: number;             // 这个产品的第一行（0-based）
  endRowIndex: number;               // 最后一行（包含）

  // 从"产品主行"抽出来的几个关键字段（直接用原列名取值）
  productName?: any;                 // 例如 row["产品名称"] / row["商品名称"]
  productDetail?: any;               // 例如 row["明细"] / row["产品明细"]
  price?: any;                       // 例如 row["SRP"] / row["价格"] / row["促销价"]
  priceColumnName?: string;          // 用的是哪一列当价格
  nameColumnName?: string;           // 用的是哪一列当产品名

  // 这个产品相关的所有行（主行 + 明细行）
  rows: Array<{
    rowIndex: number;
    raw: Record<string, any>;        // 原始整行数据（保留所有列）
  }>;
}

