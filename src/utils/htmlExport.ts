import { toPng } from "html-to-image";

/**
 * 等待指定文档中的字体加载完成
 */
async function waitForFonts(doc: Document | any) {
  if (doc && doc.fonts && doc.fonts.ready) {
    try {
      await doc.fonts.ready;
    } catch {
      // 字体加载失败时不阻塞导出流程
    }
  } else {
    // 兜底等待一下，避免立即截图导致字体还没渲染完
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/**
 * 将 DOM 节点导出为 PNG 图片的 Data URL
 * @param node - 要导出的 HTML 元素
 * @returns PNG 图片的 Data URL
 */
export async function exportNodeToPngDataUrl(
  node: HTMLElement
): Promise<string> {
  try {
    // 1）等待顶层文档的字体（我们在 BannerBatchPage 里注入了 @font-face）
    await waitForFonts(document as any);

    // 2）如果节点来自 iframe，也等待 iframe 自己的字体
    const ownerDoc: any = node.ownerDocument;
    if (ownerDoc && ownerDoc !== document) {
      await waitForFonts(ownerDoc);
    }

    const dataUrl = await toPng(node, {
      cacheBust: true,
      // 使用设备像素比导出，保持字体和细节清晰
      pixelRatio: window.devicePixelRatio || 2,
      backgroundColor: "#ffffff",
      // 宽高交给库根据节点真实尺寸计算
    });

    return dataUrl;
  } catch (error) {
    console.error("导出 PNG 失败:", error);
    throw error;
  }
}

/**
 * 将 DOM 节点导出为 PNG 文件并触发下载
 */
export async function downloadNodeAsPng(
  node: HTMLElement,
  fileName: string
): Promise<void> {
  try {
    const dataUrl = await exportNodeToPngDataUrl(node);

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    console.error("下载 PNG 失败:", error);
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
