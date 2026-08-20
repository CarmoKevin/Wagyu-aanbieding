import { fetchShopify } from "@/lib/adapters/shopify";
import { fetchWooCommerce } from "@/lib/adapters/woocommerce";
import { fetchJsonLd } from "@/lib/adapters/jsonld";
import { envNumber } from "@/lib/env";
import type { RawProduct, ShopConfig } from "@/lib/types";

type Adapter = (shop: ShopConfig, deadline: number) => Promise<RawProduct[]>;

const ADAPTERS: Record<Exclude<ShopConfig["adapter"], "auto">, Adapter> = {
  shopify: (shop, deadline) => fetchShopify(shop, deadline),
  woocommerce: (shop, deadline) => fetchWooCommerce(shop, deadline),
  jsonld: (shop, deadline) => fetchJsonLd(shop, deadline),
};

/**
 * Elke shop krijgt een eigen tijdsbudget. Zonder budget kan één trage shop
 * met drie adapters en meerdere pagina's de hele scan over de functielimiet
 * van Vercel duwen, waardoor ook de shops die het wél doen niets opleveren.
 */
export function shopBudgetMs(): number {
  return envNumber("SHOP_BUDGET_MS", 25_000, { min: 2_000, max: 120_000 });
}

/** Is de tijd voor deze shop op? */
export function isExpired(deadline: number): boolean {
  return Date.now() >= deadline;
}

/** Volgorde bij "auto": van meest naar minst betrouwbaar. */
const AUTO_ORDER: (keyof typeof ADAPTERS)[] = ["shopify", "woocommerce", "jsonld"];

export type FetchOutcome = {
  products: RawProduct[];
  via?: RawProduct["via"];
  errors: string[];
};

export async function fetchShop(shop: ShopConfig, deadline?: number): Promise<FetchOutcome> {
  const order = shop.adapter === "auto" ? AUTO_ORDER : [shop.adapter];
  const errors: string[] = [];
  const until = deadline ?? Date.now() + shopBudgetMs();

  for (const name of order) {
    if (isExpired(until)) {
      errors.push(`${name}: overgeslagen, tijdsbudget op`);
      continue;
    }
    try {
      const products = await ADAPTERS[name](shop, until);
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
