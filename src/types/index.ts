// 灵活的数据类型，支持任意字段
export type BannerData = Record<string, string | number | undefined> & {
  id?: string;  // 用于命名输出文件（可选）
};

// 兼容旧版本的 BannerFields
export type BannerFields = BannerData;

