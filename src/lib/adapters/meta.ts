import { absoluteUrl } from "@/lib/http";
import type { RawProduct, ShopConfig } from "@/lib/types";

/**
 * Terugval voor pagina's zonder bruikbare JSON-LD. Vrijwel elke webshop zet
 * OpenGraph-tags in de <head> voor Facebook en WhatsApp, en WooCommerce voegt
 * daar `product:price:amount` aan toe.
 */
const META_RE = /<meta\s+([^>]+?)\/?>/gi;
const ATTR_RE = /([a-z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** Alle metatags als property/name/itemprop -> content. */
export function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();

  for (const match of html.matchAll(META_RE)) {
    const attrs = new Map<string, string>();
    for (const attr of match[1].matchAll(ATTR_RE)) {
      attrs.set(attr[1].toLowerCase(), attr[2] ?? attr[3] ?? "");
    }
    const key = attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop");
    const content = attrs.get("content");
    if (key && content && !tags.has(key.toLowerCase())) {
      tags.set(key.toLowerCase(), content);
    }
  }
  return tags;
}

const PRIJS_SLEUTELS = ["product:price:amount", "og:price:amount", "price"];
const VALUTA_SLEUTELS = ["product:price:currency", "og:price:currency"];
const VOORRAAD_SLEUTELS = ["product:availability", "og:availability", "availability"];

export function productFromMeta(
  html: string,
  pageUrl: string,
  shop: ShopConfig,
): RawProduct | undefined {
  const tags = metaTags(html);

  const valuta = firstOf(tags, VALUTA_SLEUTELS)?.toUpperCase();
  if (valuta && valuta !== "EUR") return undefined;

  const price = toNumber(firstOf(tags, PRIJS_SLEUTELS));
  if (!price) return undefined;

  const title = tags.get("og:title") ?? titleTag(html);
  if (!title) return undefined;

  const voorraad = firstOf(tags, VOORRAAD_SLEUTELS)?.toLowerCase() ?? "";
  const image = tags.get("og:image");

  return {
    shopId: shop.id,
    shopName: shop.name,
    url: absoluteUrl(pageUrl, tags.get("og:url") ?? pageUrl),
    title: title.trim(),
    image: image ? absoluteUrl(pageUrl, image) : undefined,
    price,
    available: voorraad ? !voorraad.replace(/[\s_]/g, "").includes("outofstock") : true,
    description: tags.get("og:description")?.slice(0, 600),
    via: "jsonld",
  };
}

function firstOf(tags: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = tags.get(key);
    if (value) return value;
  }
  return undefined;
}

function titleTag(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html);
  // Shops zetten er vaak " | Shopnaam" achter; dat hoort niet in de titel.
  return match?.[1].split(/\s+[|–—]\s+/)[0].trim();
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
