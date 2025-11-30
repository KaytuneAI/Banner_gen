import { toPng } from "html-to-image";

/**
 * 将 DOM 节点导出为 PNG 图片的 Data URL
 * @param node - 要导出的 HTML 元素
 * @returns PNG 图片的 Data URL
 */
export async function exportNodeToPngDataUrl(
  node: HTMLElement
): Promise<string> {
  try {
    const dataUrl = await toPng(node, {
      cacheBust: true,
      pixelRatio: 1, // 使用 1:1 的像素比，保持原始尺寸（800x800 就导出 800x800）
      backgroundColor: '#ffffff',
      // 不指定 width/height，让库自动使用元素的实际尺寸
    });
    return dataUrl;
  } catch (error) {
    console.error("导出 PNG 失败:", error);
    throw error;
  }
}

/**
 * 将 DOM 节点导出为 PNG 图片并下载（单个文件）
 * @param node - 要导出的 HTML 元素
 * @param fileName - 下载的文件名
 */
export async function exportNodeToPng(
  node: HTMLElement,
  fileName: string
): Promise<void> {
  try {
    const dataUrl = await exportNodeToPngDataUrl(node);
    
    // 创建下载链接
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    console.error("导出 PNG 失败:", error);
    throw error;
  }
}

