import { fetchShopify } from "@/lib/adapters/shopify";
import { fetchWooCommerce } from "@/lib/adapters/woocommerce";
import { fetchJsonLd } from "@/lib/adapters/jsonld";
import type { RawProduct, ShopConfig } from "@/lib/types";

type Adapter = (shop: ShopConfig) => Promise<RawProduct[]>;

const ADAPTERS: Record<Exclude<ShopConfig["adapter"], "auto">, Adapter> = {
  shopify: (shop) => fetchShopify(shop),
  woocommerce: (shop) => fetchWooCommerce(shop),
  jsonld: (shop) => fetchJsonLd(shop),
};

/** Volgorde bij "auto": van meest naar minst betrouwbaar. */
const AUTO_ORDER: (keyof typeof ADAPTERS)[] = ["shopify", "woocommerce", "jsonld"];

export type FetchOutcome = {
  products: RawProduct[];
  via?: RawProduct["via"];
  errors: string[];
};

export async function fetchShop(shop: ShopConfig): Promise<FetchOutcome> {
  const order = shop.adapter === "auto" ? AUTO_ORDER : [shop.adapter];
  const errors: string[] = [];

  for (const name of order) {
    try {
      const products = await ADAPTERS[name](shop);
      if (products.length > 0) return { products, via: name, errors };
      errors.push(`${name}: 0 producten`);
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { products: [], errors };
}

/** Voor /api/detect: welke adapter werkt op een willekeurig domein? */
export async function detectAdapter(url: string): Promise<{ adapter: string; products: number } | null> {
  const shop: ShopConfig = { id: "detect", name: "detect", url: url.replace(/\/$/, ""), adapter: "auto" };
  const outcome = await fetchShop(shop);
  return outcome.via ? { adapter: outcome.via, products: outcome.products.length } : null;
}
