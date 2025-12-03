/**
 * 数据应用到 iframe 的逻辑
 */
import { BannerData } from "../../types";

/**
 * 更新价格字段（特殊处理，因为价格结构特殊）
 * 统一价格系统：根据整数位数自动切换 class，确保 DOM 结构统一
 */
export const updatePriceFields = (
  iframeDoc: Document,
  intValue: string,
  decimalValue: string
): void => {
  const priceEl = iframeDoc.querySelector('[data-field-int]') as HTMLElement;
  if (!priceEl) return;

  // 根据整数位数决定使用 2 位还是 3 位样式
  const intLength = intValue.length;
  const is2Digits = intLength <= 2;
  const targetIntClass = is2Digits ? 'price-int-2' : 'price-int-3';
  const targetDecimalClass = is2Digits ? 'price-decimal-2' : 'price-decimal-3';
  const targetBaseClass = is2Digits ? 'price--2digits' : 'price--3digits';

  // 同步更新外层 base class（price--2digits / price--3digits）
  priceEl.classList.remove('price--2digits', 'price--3digits');
  priceEl.classList.add(targetBaseClass);

  // 查找或创建整数 span
  let priceIntSpan = priceEl.querySelector('.price-int-2') as HTMLElement || 
                     priceEl.querySelector('.price-int-3') as HTMLElement;
  
  if (!priceIntSpan) {
    // 如果不存在，创建新的整数 span
    priceIntSpan = iframeDoc.createElement('span');
    priceIntSpan.classList.add(targetIntClass);
    
    // 查找 sign 节点，在其后插入
    const signNode = priceEl.querySelector('.sign');
    if (signNode) {
      // 查找 sign 后的第一个非 sign 节点
      let insertBefore = signNode.nextSibling;
      while (insertBefore && 
             (insertBefore.nodeType === Node.TEXT_NODE || 
              (insertBefore.nodeType === Node.ELEMENT_NODE && 
               (insertBefore as HTMLElement).classList.contains('sign')))) {
        insertBefore = insertBefore.nextSibling;
      }
      if (insertBefore) {
        priceEl.insertBefore(priceIntSpan, insertBefore);
      } else {
        priceEl.appendChild(priceIntSpan);
      }
    } else {
      // 如果没有 sign，直接添加到开头
      priceEl.insertBefore(priceIntSpan, priceEl.firstChild);
    }
  } else {
    // 如果已存在，切换 class
    priceIntSpan.classList.remove('price-int-2', 'price-int-3');
    priceIntSpan.classList.add(targetIntClass);
  }

  // 更新整数内容
  priceIntSpan.textContent = intValue;

  // 查找或创建小数 span
  let priceDecimalSpan = priceEl.querySelector('.price-decimal-2') as HTMLElement || 
                        priceEl.querySelector('.price-decimal-3') as HTMLElement;
  
  if (!priceDecimalSpan) {
    // 如果不存在，创建新的小数 span
    priceDecimalSpan = iframeDoc.createElement('span');
    priceDecimalSpan.classList.add(targetDecimalClass);
    
    // 在整数 span 后插入
    if (priceIntSpan.nextSibling) {
      priceEl.insertBefore(priceDecimalSpan, priceIntSpan.nextSibling);
    } else {
      priceEl.appendChild(priceDecimalSpan);
    }
  } else {
    // 如果已存在，切换 class
    priceDecimalSpan.classList.remove('price-decimal-2', 'price-decimal-3');
    priceDecimalSpan.classList.add(targetDecimalClass);
  }

  // 更新小数内容
  const finalDecimalValue = decimalValue.startsWith('.') ? decimalValue : '.' + decimalValue;
  priceDecimalSpan.textContent = finalDecimalValue;

  // 清理旧结构：删除 sign 后的文本节点和旧的 .decimal span
  const signNode = priceEl.querySelector('.sign');
  if (signNode) {
    let node = signNode.nextSibling;
    while (node) {
      const nextSibling = node.nextSibling;
      
      // 删除文本节点（旧结构留下的）
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) {
        node.remove();
      }
      // 删除或清空旧的 .decimal span（不是 price-decimal-*）
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.classList.contains('decimal') && 
            !el.classList.contains('price-decimal-2') && 
            !el.classList.contains('price-decimal-3')) {
          el.remove();
        }
      }
      
      node = nextSibling;
    }
  }

  // 确保只有一个整数 span 和一个小数 span（清理多余的）
  const allIntSpans = priceEl.querySelectorAll('.price-int-2, .price-int-3');
  const allDecimalSpans = priceEl.querySelectorAll('.price-decimal-2, .price-decimal-3');
  
  if (allIntSpans.length > 1) {
    // 保留第一个，删除其他的
    for (let i = 1; i < allIntSpans.length; i++) {
      allIntSpans[i].remove();
    }
  }
  
  if (allDecimalSpans.length > 1) {
    // 保留第一个，删除其他的
    for (let i = 1; i < allDecimalSpans.length; i++) {
      allDecimalSpans[i].remove();
    }
  }
};

/**
 * 将 JSON 数据应用到指定的 iframe（用于多图模式）
 */
export const applyJsonDataToMultiIframe = (
  iframe: HTMLIFrameElement,
  data: BannerData,
  index: number,
  editedValues: Record<number, Record<string, string>>
): void => {
  if (!iframe) return;
  
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // 获取该索引的编辑值（如果有）
    const edits = editedValues[index] || {};

    // 特殊处理价格区域
    if (data.sec_price_int !== undefined && data.sec_price_decimal !== undefined) {
      const intValue = edits.sec_price_int !== undefined ? edits.sec_price_int : String(data.sec_price_int);
      const decimalValue = edits.sec_price_decimal !== undefined ? edits.sec_price_decimal : String(data.sec_price_decimal);
      updatePriceFields(iframeDoc, intValue, decimalValue);
    }

    // 特殊处理主产品图片数组（product_main_src）
    if (data.product_main_src !== undefined) {
      const productContainer = iframeDoc.querySelector(".product") as HTMLElement;
      if (productContainer) {
        const templateImgs = Array.from(productContainer.querySelectorAll("img")) as HTMLImageElement[];
        let baseImgs: string[] = [];
        const rawValue = edits.product_main_src !== undefined ? edits.product_main_src : data.product_main_src;
        
        if (Array.isArray(rawValue)) {
          baseImgs = rawValue.map(v => String(v));
        } else if (rawValue) {
          baseImgs = [String(rawValue)];
        }

        const qtyValue = edits.product_main_qty !== undefined ? edits.product_main_qty : data.product_main_qty;
        const qty = qtyValue !== undefined ? Number(qtyValue) : (baseImgs.length || 1);
        
        let imgs: string[] = [];
        if (baseImgs.length > 0) {
          if (baseImgs.length === 1) {
            imgs = Array(qty).fill(baseImgs[0]);
          } else {
            imgs = baseImgs.slice(0, Math.max(1, qty));
          }
        }

        if (templateImgs.length > 0) {
          while (templateImgs.length < imgs.length) {
            const lastImg = templateImgs[templateImgs.length - 1];
            const clone = lastImg.cloneNode(true) as HTMLImageElement;
            productContainer.appendChild(clone);
            templateImgs.push(clone);
          }

          imgs.forEach((src, idx) => {
            const img = templateImgs[idx];
            img.src = src;
            img.style.display = "";
          });

          for (let i = imgs.length; i < templateImgs.length; i++) {
            const img = templateImgs[i];
            img.style.display = "none";
          }
        } else {
          productContainer.innerHTML = "";
          imgs.forEach((src) => {
            const img = iframeDoc.createElement("img");
            img.src = src;
            img.alt = "主产品";
            img.setAttribute("data-field", "product_main_src");
            img.setAttribute("data-label", "主产品图片");
            productContainer.appendChild(img);
          });
        }
      }
    }

    // 特殊处理赠品图片
    if (data.gift_products_src !== undefined) {
      const giftContainer = iframeDoc.querySelector(".giftproducts") as HTMLElement;
      if (giftContainer) {
        let baseImgs: string[] = [];
        const rawValue = edits.gift_products_src !== undefined ? edits.gift_products_src : data.gift_products_src;
        
        if (Array.isArray(rawValue)) {
          baseImgs = rawValue.map(v => String(v));
        } else if (rawValue) {
          baseImgs = [String(rawValue)];
        }

        const qtyValue = edits.gift_products_qty !== undefined ? edits.gift_products_qty : data.gift_products_qty;
        const qty = qtyValue !== undefined ? Number(qtyValue) : 1;
        
        let imgs: string[] = [];
        if (baseImgs.length > 0) {
          if (baseImgs.length === 1) {
            imgs = Array(qty).fill(baseImgs[0]);
          } else {
            imgs = baseImgs.slice(0, Math.max(1, qty));
          }
        }

        giftContainer.innerHTML = "";
        const count = imgs.length;
        const className = `giftproductsimg-${count}`;

        imgs.forEach((src, idx) => {
          const img = iframeDoc.createElement("img");
          img.src = src;
          img.alt = `赠品${idx + 1}`;
          img.className = className;
          img.setAttribute("data-field", `gift_products_src_${idx + 1}`);
          img.setAttribute("data-label", `赠品图片${idx + 1}`);
          giftContainer.appendChild(img);
        });
      }
    } else if (data.gift_products_src_1 !== undefined) {
      const giftContainer = iframeDoc.querySelector(".giftproducts") as HTMLElement;
      if (giftContainer) {
        const giftSrc1 = edits.gift_products_src_1 !== undefined ? edits.gift_products_src_1 : data.gift_products_src_1;
        const qtyValue = edits.gift_products_qty_1 !== undefined ? edits.gift_products_qty_1 : data.gift_products_qty_1;
        const qty = qtyValue !== undefined ? Number(qtyValue) : 1;
        const imgs: string[] = Array(qty).fill(String(giftSrc1));

        giftContainer.innerHTML = "";
        const count = imgs.length;
        const className = `giftproductsimg-${count}`;

        imgs.forEach((src, idx) => {
          const img = iframeDoc.createElement("img");
          img.src = src;
          img.alt = `赠品${idx + 1}`;
          img.className = className;
          img.setAttribute("data-field", `gift_products_src_${idx + 1}`);
          img.setAttribute("data-label", `赠品图片${idx + 1}`);
          giftContainer.appendChild(img);
        });
      }
    }

    // 遍历所有字段，更新对应元素
    Object.entries(data).forEach(([fieldName, value]) => {
      if (value === undefined || value === null) return;
      if (fieldName === 'sec_price_int' || 
          fieldName === 'sec_price_decimal' || 
          fieldName === 'product_main_src' || 
          fieldName === 'gift_products_src') return;
      if (Array.isArray(value)) return;

      const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
      if (element) {
        const finalValue = edits[fieldName] !== undefined ? edits[fieldName] : String(value);
        
        if (element.tagName === "IMG") {
          (element as HTMLImageElement).src = finalValue;
        } else {
          element.textContent = finalValue;
        }
      }
    });
    
    // 应用编辑值中可能存在的额外字段
    Object.entries(edits).forEach(([fieldName, value]) => {
      if (data[fieldName] === undefined && 
          fieldName !== 'sec_price_int' && 
          fieldName !== 'sec_price_decimal' &&
          fieldName !== 'product_main_src' &&
          fieldName !== 'gift_products_src') {
        const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
        if (element) {
          if (Array.isArray(value)) return;
          
          if (element.tagName === "IMG") {
            (element as HTMLImageElement).src = String(value);
          } else {
            element.textContent = String(value);
          }
        }
      }
    });
  } catch (e) {
    console.warn("无法应用 JSON 数据到多图 iframe:", e);
  }
};

/**
 * 将 JSON 数据应用到 iframe（会合并已编辑的值）
 */
export const applyJsonDataToIframe = (
  iframe: HTMLIFrameElement,
  data: BannerData,
  index: number,
  editedValues: Record<number, Record<string, string>>
): void => {
  if (!iframe) return;

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // 获取该索引的编辑值（如果有）
    const edits = editedValues[index] || {};

    // 特殊处理价格区域
    if (data.sec_price_int !== undefined && data.sec_price_decimal !== undefined) {
      const intValue = edits.sec_price_int !== undefined ? edits.sec_price_int : String(data.sec_price_int);
      const decimalValue = edits.sec_price_decimal !== undefined ? edits.sec_price_decimal : String(data.sec_price_decimal);
      updatePriceFields(iframeDoc, intValue, decimalValue);
    }

    // 特殊处理主产品图片数组（product_main_src）
    if (data.product_main_src !== undefined) {
      const productContainer = iframeDoc.querySelector(".product") as HTMLElement;
      if (productContainer) {
        const templateImgs = Array.from(productContainer.querySelectorAll("img")) as HTMLImageElement[];
        let baseImgs: string[] = [];
        const rawValue = edits.product_main_src !== undefined ? edits.product_main_src : data.product_main_src;
        
        if (Array.isArray(rawValue)) {
          baseImgs = rawValue.map(v => String(v));
        } else if (rawValue) {
          baseImgs = [String(rawValue)];
        }

        const qtyValue = edits.product_main_qty !== undefined ? edits.product_main_qty : data.product_main_qty;
        const qty = qtyValue !== undefined ? Number(qtyValue) : (baseImgs.length || 1);
        
        let imgs: string[] = [];
        if (baseImgs.length > 0) {
          if (baseImgs.length === 1) {
            imgs = Array(qty).fill(baseImgs[0]);
          } else {
            imgs = baseImgs.slice(0, Math.max(1, qty));
          }
        }

        if (templateImgs.length > 0) {
          while (templateImgs.length < imgs.length) {
            const lastImg = templateImgs[templateImgs.length - 1];
            const clone = lastImg.cloneNode(true) as HTMLImageElement;
            productContainer.appendChild(clone);
            templateImgs.push(clone);
          }

          imgs.forEach((src, idx) => {
            const img = templateImgs[idx];
            img.src = src;
            img.style.display = "";
          });

          for (let i = imgs.length; i < templateImgs.length; i++) {
            const img = templateImgs[i];
            img.style.display = "none";
          }
        } else {
          productContainer.innerHTML = "";
          imgs.forEach((src) => {
            const img = iframeDoc.createElement("img");
            img.src = src;
            img.alt = "主产品";
            img.setAttribute("data-field", "product_main_src");
            img.setAttribute("data-label", "主产品图片");
            productContainer.appendChild(img);
          });
        }
      }
    }

    // 特殊处理赠品图片
    if (data.gift_products_src !== undefined) {
      const giftContainer = iframeDoc.querySelector(".giftproducts") as HTMLElement;
      if (giftContainer) {
        let baseImgs: string[] = [];
        const rawValue = edits.gift_products_src !== undefined ? edits.gift_products_src : data.gift_products_src;
        
        if (Array.isArray(rawValue)) {
          baseImgs = rawValue.map(v => String(v));
        } else if (rawValue) {
          baseImgs = [String(rawValue)];
        }

        const qtyValue = edits.gift_products_qty !== undefined ? edits.gift_products_qty : data.gift_products_qty;
        const qty = qtyValue !== undefined ? Number(qtyValue) : 1;
        
        let imgs: string[] = [];
        if (baseImgs.length > 0) {
          if (baseImgs.length === 1) {
            imgs = Array(qty).fill(baseImgs[0]);
          } else {
            imgs = baseImgs.slice(0, Math.max(1, qty));
          }
        }

        giftContainer.innerHTML = "";
        const count = imgs.length;
        const className = `giftproductsimg-${count}`;

        imgs.forEach((src, idx) => {
          const img = iframeDoc.createElement("img");
          img.src = src;
          img.alt = `赠品${idx + 1}`;
          img.className = className;
          img.setAttribute("data-field", `gift_products_src_${idx + 1}`);
          img.setAttribute("data-label", `赠品图片${idx + 1}`);
          giftContainer.appendChild(img);
        });
      }
    } else if (data.gift_products_src_1 !== undefined) {
      const giftContainer = iframeDoc.querySelector(".giftproducts") as HTMLElement;
      if (giftContainer) {
        const giftSrc1 = edits.gift_products_src_1 !== undefined ? edits.gift_products_src_1 : data.gift_products_src_1;
        const qtyValue = edits.gift_products_qty_1 !== undefined ? edits.gift_products_qty_1 : data.gift_products_qty_1;
        const qty = qtyValue !== undefined ? Number(qtyValue) : 1;
        const imgs: string[] = Array(qty).fill(String(giftSrc1));

        giftContainer.innerHTML = "";
        const count = imgs.length;
        const className = `giftproductsimg-${count}`;

        imgs.forEach((src, idx) => {
          const img = iframeDoc.createElement("img");
          img.src = src;
          img.alt = `赠品${idx + 1}`;
          img.className = className;
          img.setAttribute("data-field", `gift_products_src_${idx + 1}`);
          img.setAttribute("data-label", `赠品图片${idx + 1}`);
          giftContainer.appendChild(img);
        });
      }
    }

    // 遍历所有字段，更新对应元素
    Object.entries(data).forEach(([fieldName, value]) => {
      if (value === undefined || value === null) return;
      if (fieldName === 'sec_price_int' || 
          fieldName === 'sec_price_decimal' || 
          fieldName === 'product_main_src' || 
          fieldName === 'gift_products_src') return;
      if (Array.isArray(value)) return;

      const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
      if (element) {
        const finalValue = edits[fieldName] !== undefined ? edits[fieldName] : String(value);
        
        if (element.tagName === "IMG") {
          (element as HTMLImageElement).src = finalValue;
        } else {
          element.textContent = finalValue;
        }
      }
    });
    
    // 应用编辑值中可能存在的额外字段
    Object.entries(edits).forEach(([fieldName, value]) => {
      if (data[fieldName] === undefined && 
          fieldName !== 'sec_price_int' && 
          fieldName !== 'sec_price_decimal' &&
          fieldName !== 'product_main_src' &&
          fieldName !== 'gift_products_src') {
        const element = iframeDoc.querySelector(`[data-field="${fieldName}"]`) as HTMLElement;
        if (element) {
          if (Array.isArray(value)) return;
          
          if (element.tagName === "IMG") {
            (element as HTMLImageElement).src = String(value);
          } else {
            element.textContent = String(value);
          }
        }
      }
    });
  } catch (e) {
    console.warn("无法应用 JSON 数据到 iframe:", e);
  }
};

