import shopsJson from "@/../config/shops.json";
import { fetchShop } from "@/lib/adapters";
import { keepWagyu, normalize, round } from "@/lib/normalize";
import { median, scoreAll } from "@/lib/score";
import { appendPrices, loadHistory, saveHistory, type History } from "@/lib/store";
import { summarize } from "@/lib/agent";
import type { Deal, ScanResult, ShopConfig, SourceHealth } from "@/lib/types";

export const shops: ShopConfig[] = (shopsJson as ShopConfig[]).filter((s) => s.enabled !== false);

/** Haalt alle shops op, verrijkt, scoort en bewaart de prijshistorie. */
export async function scanAll(options: { withSummary?: boolean } = {}): Promise<ScanResult> {
  const seenAt = new Date().toISOString();
  const history = await loadHistory();

  const results = await Promise.all(shops.map((shop) => scanShop(shop, seenAt, history)));

  const deals = scoreAll(results.flatMap((r) => r.deals));
  const health = results.map((r) => r.health);

  await saveHistory(
    appendPrices(
      history,
      deals.map((d) => ({ id: d.id, price: d.price })),
    ),
  );

  const summary = options.withSummary ? await summarize(deals.slice(0, 15)) : undefined;
  return { generatedAt: seenAt, deals, health, summary };
}

async function scanShop(
  shop: ShopConfig,
  seenAt: string,
  history: History,
): Promise<{ deals: Deal[]; health: SourceHealth }> {
  const started = Date.now();
  try {
    const { products, via, errors } = await fetchShop(shop);
    const wagyu = keepWagyu(products);
    const deals = wagyu.map((raw) => withHistoryDiscount(normalize(raw, seenAt), history));

    return {
      deals,
      health: {
        shopId: shop.id,
        shopName: shop.name,
        ok: deals.length > 0,
        via,
        products: products.length,
        wagyuProducts: deals.length,
        ms: Date.now() - started,
        error: deals.length === 0 ? errors.join(" | ") || "geen wagyu gevonden" : undefined,
      },
    };
  } catch (err) {
    return {
      deals: [],
      health: {
        shopId: shop.id,
        shopName: shop.name,
        ok: false,
        products: 0,
        wagyuProducts: 0,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Publiceert de shop geen van-prijs, dan vergelijken we met de mediaan van
 * eerdere metingen. Dat vangt stille prijsverlagingen op en negeert opgeblazen
 * adviesprijzen.
 */
export function withHistoryDiscount(deal: Deal, history: History): Deal {
  if (deal.discountPct !== undefined) return deal;

  const earlier = (history[deal.id] ?? []).filter((p) => p.p > 0);
  if (earlier.length < 3) return deal;

  const reference = median(earlier.map((p) => p.p));
  if (!reference || reference <= deal.price) return deal;

  const pct = round((1 - deal.price / reference) * 100, 1);
  if (pct < 3) return deal;

  return { ...deal, discountPct: pct, discountBasis: "history" };
}
