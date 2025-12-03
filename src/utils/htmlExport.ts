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
    // 等待顶层文档字体加载完成（包括我们刚刚注入的 @font-face）
    const anyDoc: any = document;
    if (anyDoc.fonts && anyDoc.fonts.ready) {
      try {
        await anyDoc.fonts.ready;
        // 额外等待一小段时间，确保字体完全渲染
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch {
        // 忽略字体加载错误，继续执行
      }
    } else {
      // 如果没有 fonts API，等待一段时间让字体加载
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const dataUrl = await toPng(node, {
      cacheBust: true,
      // 使用屏幕的 devicePixelRatio 导出，保持和预览接近的清晰度与字形
      pixelRatio: window.devicePixelRatio || 2,
      backgroundColor: "#ffffff",
      // 不指定 width/height，让库自动使用元素的实际尺寸
    });

    return dataUrl;
  } catch (error) {
    console.error("导出 PNG 失败:", error);
    throw error;
  }
}

/**
 * 将 DOM 节点导出为 PNG 文件并下载
 * @param node - 要导出的 HTML 元素
 * @param fileName - 下载的文件名
 */
export async function downloadNodeAsPng(
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

/**
 * 将 DOM 节点导出为 PNG 图片并下载（单个文件）
 * @deprecated 使用 downloadNodeAsPng 代替
 * @param node - 要导出的 HTML 元素
 * @param fileName - 下载的文件名
 */
export async function exportNodeToPng(
  node: HTMLElement,
  fileName: string
): Promise<void> {
  return downloadNodeAsPng(node, fileName);
}

