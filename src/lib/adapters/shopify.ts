import { fetchJson } from "@/lib/http";
import { isAllowed } from "@/lib/robots";
import type { RawProduct, ShopConfig } from "@/lib/types";

/**
 * Elke Shopify-shop serveert /products.json met de volledige catalogus,
 * inclusief `compare_at_price` (de van-prijs) en `grams` per variant.
 */
type ShopifyResponse = {
  products: {
    id: number;
    title: string;
    handle: string;
    body_html?: string;
    product_type?: string;
    tags?: string[] | string;
    images?: { src: string }[];
    variants: {
      id: number;
      title: string;
      price: string;
      compare_at_price?: string | null;
      available?: boolean;
      grams?: number;
    }[];
  }[];
};

const PAGE_SIZE = 250;

export async function fetchShopify(shop: ShopConfig, maxPages = 4): Promise<RawProduct[]> {
  const products: RawProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${shop.url}/products.json?limit=${PAGE_SIZE}&page=${page}`;
    if (!(await isAllowed(url))) break;

    const data = await fetchJson<ShopifyResponse>(url);
    if (!Array.isArray(data.products)) throw new Error("Onverwacht Shopify-antwoord");
    if (data.products.length === 0) break;

    for (const product of data.products) {
      const tags = Array.isArray(product.tags)
        ? product.tags
        : typeof product.tags === "string"
          ? product.tags.split(",").map((t) => t.trim())
          : [];

      for (const variant of product.variants ?? []) {
        const price = Number(variant.price);
        if (!Number.isFinite(price) || price <= 0) continue;
        const compareAt = variant.compare_at_price ? Number(variant.compare_at_price) : undefined;

        products.push({
          shopId: shop.id,
          shopName: shop.name,
          url: `${shop.url}/products/${product.handle}?variant=${variant.id}`,
          title: product.title,
          variantTitle: variant.title && variant.title !== "Default Title" ? variant.title : undefined,
          image: product.images?.[0]?.src,
          price,
          compareAtPrice: compareAt && compareAt > price ? compareAt : undefined,
          available: variant.available !== false,
          weightGramsHint: variant.grams && variant.grams > 0 ? variant.grams : undefined,
          productType: product.product_type,
          tags,
          description: stripHtml(product.body_html),
          via: "shopify",
        });
      }
    }

    if (data.products.length < PAGE_SIZE) break;
  }

  return products;
}

export function stripHtml(html: string | undefined): string | undefined {
  if (!html) return undefined;
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}
