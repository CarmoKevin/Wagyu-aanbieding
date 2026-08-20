import { isExpired } from "@/lib/adapters";
import { fetchJson } from "@/lib/http";
import { isAllowed } from "@/lib/robots";
import { stripHtml } from "@/lib/adapters/shopify";
import type { RawProduct, ShopConfig } from "@/lib/types";

/**
 * WooCommerce Store API (publiek, geen key nodig). Prijzen komen als integer
 * in de kleinste eenheid, met `currency_minor_unit` als aantal decimalen.
 */
type WooProduct = {
  id: number;
  name: string;
  permalink: string;
  description?: string;
  short_description?: string;
  is_in_stock?: boolean;
  images?: { src: string }[];
  categories?: { name: string }[];
  prices: {
    price: string;
    regular_price: string;
    sale_price?: string;
    currency_minor_unit: number;
  };
};

export async function fetchWooCommerce(
  shop: ShopConfig,
  deadline = Infinity,
  maxPages = 3,
): Promise<RawProduct[]> {
  const products: RawProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    if (isExpired(deadline)) break;
    const url = `${shop.url}/wp-json/wc/store/v1/products?search=wagyu&per_page=100&page=${page}`;
    if (!(await isAllowed(url))) break;

    const data = await fetchJson<WooProduct[]>(url);
    if (!Array.isArray(data)) throw new Error("Onverwacht WooCommerce-antwoord");
    if (data.length === 0) break;

    for (const product of data) {
      const minor = product.prices?.currency_minor_unit ?? 2;
      const price = toMajor(product.prices?.price, minor);
      if (!price) continue;
      const regular = toMajor(product.prices?.regular_price, minor);

      products.push({
        shopId: shop.id,
        shopName: shop.name,
        url: product.permalink,
        title: product.name,
        image: product.images?.[0]?.src,
        price,
        compareAtPrice: regular && regular > price ? regular : undefined,
        available: product.is_in_stock !== false,
        tags: product.categories?.map((c) => c.name),
        description: stripHtml(product.short_description || product.description),
        via: "woocommerce",
      });
    }

    if (data.length < 100) break;
  }

  return products;
}

function toMajor(value: string | undefined, minorUnit: number): number | undefined {
  if (!value) return undefined;
  const n = Number(value) / 10 ** minorUnit;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
