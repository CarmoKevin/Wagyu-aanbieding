import { isWagyu, parseCut, parseGrade, parseOrigin } from "@/lib/parse/classify";
import { isUnitPriced, parseWeightGrams, pricePerKg } from "@/lib/parse/weight";
import type { Deal, RawProduct } from "@/lib/types";

/** Stabiele id, zodat prijshistorie over runs heen te volgen is. */
export function dealId(raw: RawProduct): string {
  const key = `${raw.shopId}:${raw.url}:${raw.variantTitle ?? ""}`;
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

export function normalize(raw: RawProduct, seenAt = new Date().toISOString()): Deal {
  const text = [raw.title, raw.variantTitle, raw.productType, raw.tags?.join(" ")].filter(Boolean).join(" ");

  const { weightGrams, weightSource } = resolveWeight(raw);
  const perKg = pricePerKg(raw.price, weightGrams);

  const discountPct =
    raw.compareAtPrice && raw.compareAtPrice > raw.price
      ? round((1 - raw.price / raw.compareAtPrice) * 100, 1)
      : undefined;

  return {
    ...raw,
    id: dealId(raw),
    weightGrams,
    weightSource,
    pricePerKg: perKg ? round(perKg, 2) : undefined,
    discountPct,
    discountBasis: discountPct !== undefined ? "shop" : undefined,
    grade: parseGrade(text),
    origin: parseOrigin(`${text} ${raw.description ?? ""}`),
    cut: parseCut(text),
    score: 0,
    reasons: [],
    seenAt,
  };
}

function resolveWeight(raw: RawProduct): { weightGrams?: number; weightSource?: Deal["weightSource"] } {
  const fromVariant = parseWeightGrams(raw.variantTitle);
  if (fromVariant) return { weightGrams: fromVariant, weightSource: "variant" };

  const fromTitle = parseWeightGrams(raw.title);
  if (fromTitle) return { weightGrams: fromTitle, weightSource: "title" };

  // "per 100 gram" betekent dat de prijs voor die eenheid geldt.
  const unit = isUnitPriced(`${raw.title} ${raw.variantTitle ?? ""} ${raw.description ?? ""}`);
  if (unit) return { weightGrams: unit, weightSource: "unit-price" };

  if (raw.weightGramsHint) return { weightGrams: raw.weightGramsHint, weightSource: "field" };

  const fromDescription = parseWeightGrams(raw.description);
  if (fromDescription) return { weightGrams: fromDescription, weightSource: "title" };

  return {};
}

/** Filtert alles wat geen wagyu is en gooit dubbele varianten weg. */
export function keepWagyu(products: RawProduct[]): RawProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => {
    if (!isWagyu(p.title, p.variantTitle, p.productType, p.tags)) return false;
    const key = dealId(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
