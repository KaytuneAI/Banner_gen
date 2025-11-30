import React from "react";
import { BannerFields } from "../../../types";
import "./Dove750x400.css";

interface Props {
  fields: BannerFields;
  imageUrlResolver?: (key: string) => string;
}

export const Dove750x400: React.FC<Props> = ({ fields, imageUrlResolver }) => {
  const productImageSrc =
    imageUrlResolver?.(String(fields.product_image ?? "")) ??
    String(fields.product_image ?? "");

  return (
    <div className="banner banner-dove-750x400">
      <div className="banner-activity">
        {fields.activity_name}
      </div>
      <div className="banner-title">
        {fields.main_title}
      </div>
      <div className="banner-promo">
        {fields.promo_text}
      </div>
      <div className="banner-price">
        <span className="banner-price-symbol">¥</span>
        <span className="banner-price-value">
          {fields.price}
        </span>
      </div>
      {fields.price_extra && (
        <div className="banner-price-extra">
          {fields.price_extra}
        </div>
      )}
      <img
        className="banner-product"
        src={String(productImageSrc)}
        alt="product"
        onError={(e) => {
          // 如果图片加载失败，显示占位符
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
      />
    </div>
  );
};



