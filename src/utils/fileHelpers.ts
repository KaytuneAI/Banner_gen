import { BannerData } from "../types";

/**
 * 解析上传的 JSON 文件
 * @param file - JSON 文件
 * @returns 解析后的 BannerData 数组
 */
export async function parseJsonFile(file: File): Promise<BannerData[]> {
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed as BannerData[];
    } else if (typeof parsed === "object" && parsed !== null) {
      // 如果是单个对象，转换为数组
      return [parsed as BannerData];
    } else {
      throw new Error("JSON 文件必须是一个对象或数组");
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error("JSON 格式错误，请检查文件内容");
    }
    throw e;
  }
}

/**
 * 处理图片文件上传，创建文件名到 Object URL 的映射
 * @param files - 图片文件列表
 * @returns 文件名到 URL 的映射对象
 */
export function createImageMap(files: FileList | null): Record<string, string> {
  if (!files) return {};

  const map: Record<string, string> = {};
  Array.from(files).forEach((file) => {
    const url = URL.createObjectURL(file);
    map[file.name] = url;
  });

  return map;
}

/**
 * 清理图片映射中的 Object URL，释放内存
 * @param imageMap - 图片映射对象
 */
export function cleanupImageMap(imageMap: Record<string, string>): void {
  Object.values(imageMap).forEach((url) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  });
}

/**
 * 读取文本文件内容
 * @param file - 文本文件
 * @returns 文件内容字符串
 */
export async function readTextFile(file: File): Promise<string> {
  return await file.text();
}

/**
 * 解析 HTML 文件
 * @param file - HTML 文件
 * @returns HTML 内容字符串
 */
export async function parseHtmlFile(file: File): Promise<string> {
  return await readTextFile(file);
}

/**
 * 解析 CSS 文件
 * @param file - CSS 文件
 * @returns CSS 内容字符串
 */
export async function parseCssFile(file: File): Promise<string> {
  return await readTextFile(file);
}

