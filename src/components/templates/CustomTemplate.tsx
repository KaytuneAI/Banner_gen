import React, { useEffect, useRef } from "react";
import { BannerFields } from "../../types";

interface CustomTemplateProps {
  htmlContent: string;
  cssContent: string;
  fields: BannerFields;
  imageUrlResolver?: (key: string) => string;
}

export const CustomTemplate: React.FC<CustomTemplateProps> = ({
  htmlContent,
  cssContent,
  fields,
  imageUrlResolver,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    // 注入 CSS
    let styleElement = document.getElementById("custom-template-style") as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "custom-template-style";
      document.head.appendChild(styleElement);
      styleRef.current = styleElement;
    } else {
      styleRef.current = styleElement;
    }

    if (styleRef.current) {
      styleRef.current.textContent = cssContent || "";
    }

    return () => {
      // 组件卸载时清理样式（可选，如果需要的话）
      // 注意：如果多个组件共享同一个样式 ID，这里不应该删除
    };
  }, [cssContent]);

  useEffect(() => {
    if (!containerRef.current) return;

    // 替换 HTML 中的占位符
    let processedHtml = htmlContent;

    // 替换所有字段占位符 {{field_name}}
    Object.entries(fields).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      
      if (key === "product_image" && imageUrlResolver) {
        const imageUrl = imageUrlResolver(value as string);
        processedHtml = processedHtml.replace(regex, imageUrl);
      } else {
        processedHtml = processedHtml.replace(regex, String(value || ""));
      }
    });

    // 设置 HTML 内容
    containerRef.current.innerHTML = processedHtml;

    // 处理图片加载错误
    const images = containerRef.current.querySelectorAll("img");
    images.forEach((img) => {
      img.onerror = () => {
        img.style.display = "none";
      };
    });
  }, [htmlContent, fields, imageUrlResolver]);

  return (
    <div 
      ref={containerRef} 
      className="custom-template-container"
      style={{ 
        position: "relative",
        width: "100%",
        height: "100%"
      }}
    />
  );
};

