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
 * 导出选项接口
 */
export interface ExportOptions {
  /**
   * 要嵌入的字体 CSS（包含 @font-face 规则）
   * 用于确保 html-to-image 能正确渲染自定义字体
   */
  fontEmbedCSS?: string;
}

/**
 * 将 DOM 节点导出为 PNG 图片的 Data URL
 * @param node - 要导出的 HTML 元素
 * @param options - 可选的导出配置
 * @returns PNG 图片的 Data URL
 */
export async function exportNodeToPngDataUrl(
  node: HTMLElement,
  options?: ExportOptions
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
      // 传递字体 CSS，确保 html-to-image 能识别并嵌入字体
      ...(options?.fontEmbedCSS && { fontEmbedCSS: options.fontEmbedCSS }),
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
