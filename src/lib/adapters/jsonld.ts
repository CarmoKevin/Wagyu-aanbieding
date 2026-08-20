import { isExpired } from "@/lib/adapters";
import { absoluteUrl, fetchText, mapLimit } from "@/lib/http";
import { isAllowed } from "@/lib/robots";
import { productFromMeta } from "@/lib/adapters/meta";
import { sitemapWagyuLinks } from "@/lib/adapters/sitemap";
import { isWagyu } from "@/lib/parse/classify";
import type { RawProduct, ShopConfig } from "@/lib/types";

/**
 * Generieke adapter voor shops zonder publieke product-API (Magento,
 * Lightspeed, CCV, maatwerk). Vrijwel elke webshop zet schema.org JSON-LD in de
 * pagina voor Google; dat lezen we uit. Levert een listing geen prijzen, dan
 * volgen we een beperkt aantal productpagina's.
 */
const SCRIPT_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export async function fetchJsonLd(
  shop: ShopConfig,
  deadline = Infinity,
  maxProductPages = 24,
): Promise<RawProduct[]> {
  const listings = (shop.listingPaths ?? ["/"]).map((path) => absoluteUrl(shop.url + "/", path));
  const found = new Map<string, RawProduct>();
  const candidateLinks = new Set<string>();

  for (const listing of listings) {
    if (isExpired(deadline)) break;
    if (!(await isAllowed(listing))) continue;
    let html: string;
    try {
      html = await fetchText(listing);
    } catch {
      continue;
    }

    for (const product of productsFromHtml(html, listing, shop)) {
      found.set(product.url, product);
    }
    for (const link of productLinks(html, listing)) {
      candidateLinks.add(link);
    }
  }

  // Leveren de categoriepagina's weinig op, dan is de kans groot dat de shop
  // zijn producten met JavaScript inlaadt. De sitemap kent ze wel.
  if (found.size < maxProductPages && !isExpired(deadline)) {
    try {
      for (const link of await sitemapWagyuLinks(new URL(shop.url).origin, deadline)) {
        candidateLinks.add(link);
      }
    } catch {
      // Geen sitemap: dan blijven we bij de links van de categoriepagina.
    }
  }

  // Productpagina's zelf ophalen. Eerst de links die er als productpagina
  // uitzien, want elke fetch kost tijd.
  const toVisit = rankProductLinks(
    [...candidateLinks].filter((link) => !found.has(link) && isWagyu(safeDecode(link))),
  ).slice(0, maxProductPages);

  await mapLimit(toVisit, 4, async (link) => {
    if (isExpired(deadline)) return;
    if (!(await isAllowed(link))) return;
    try {
      const html = await fetchText(link);
      for (const product of productsFromHtml(html, link, shop)) {
        found.set(product.url, product);
      }
    } catch {
      // Eén kapotte productpagina mag de hele shop niet laten falen.
    }
  });

  return [...found.values()];
}

export function productsFromHtml(html: string, pageUrl: string, shop: ShopConfig): RawProduct[] {
  const out: RawProduct[] = [];

  for (const node of jsonLdNodes(html)) {
    for (const product of flattenProducts(node)) {
      const raw = toRawProduct(product, pageUrl, shop);
      if (raw) out.push(raw);
    }
  }

  // Geen bruikbare JSON-LD (of wel data, maar zonder prijs): dan de
  // OpenGraph-tags proberen.
  if (out.length === 0) {
    const uitMeta = productFromMeta(html, pageUrl, shop);
    if (uitMeta) out.push(uitMeta);
  }
  return out;
}

/** Alle JSON-LD blokken uit een pagina, kapotte blokken worden overgeslagen. */
export function jsonLdNodes(html: string): unknown[] {
  const nodes: unknown[] = [];
  for (const match of html.matchAll(SCRIPT_RE)) {
    const body = match[1].trim().replace(/^﻿/, "");
    try {
      nodes.push(JSON.parse(body));
    } catch {
      // Sommige shops zetten er ongeldige JSON of comments in.
    }
  }
  return nodes;
}

type JsonLdProduct = Record<string, unknown>;

/** Haalt Product-nodes uit @graph, ItemList, arrays en losse objecten. */
function flattenProducts(node: unknown, depth = 0): JsonLdProduct[] {
  if (!node || depth > 6) return [];
  if (Array.isArray(node)) return node.flatMap((n) => flattenProducts(n, depth + 1));
  if (typeof node !== "object") return [];

  const obj = node as JsonLdProduct;
  const type = typeList(obj["@type"]);
  const out: JsonLdProduct[] = [];

  // ProductGroup is de variabele-productvorm van WooCommerce en Shopify: de
  // groep draagt de naam, de losse maten zitten in hasVariant.
  if (type.some((t) => t === "product" || t === "productgroup")) out.push(obj);

  for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasVariant"]) {
    if (obj[key]) out.push(...flattenProducts(obj[key], depth + 1));
  }
  return out;
}

function typeList(value: unknown): string[] {
  if (typeof value === "string") return [value.toLowerCase()];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase());
  return [];
}

function toRawProduct(product: JsonLdProduct, pageUrl: string, shop: ShopConfig): RawProduct | undefined {
  const name = asString(product.name);
  if (!name) return undefined;

  const offer = firstOffer(product.offers);
  const price = offerPrice(offer);
  if (!price) return undefined;

  const url = absoluteUrl(pageUrl, asString(product.url) ?? asString(offer?.url) ?? pageUrl);
  const availability = (asString(offer?.availability) ?? "").toLowerCase();

  return {
    shopId: shop.id,
    shopName: shop.name,
    url,
    title: name,
    image: imageUrl(product.image, pageUrl),
    price,
    // schema.org kent geen van-prijs; korting komt hier uit de prijshistorie.
    available: availability ? !availability.includes("outofstock") : true,
    productType: asString(product.category),
    description: asString(product.description)?.slice(0, 600),
    via: "jsonld",
  };
}

/**
 * De prijs kan op drie plekken staan: los op de Offer, als lowPrice op een
 * AggregateOffer, of verstopt in een priceSpecification.
 */
export function offerPrice(offer: Record<string, unknown> | undefined): number | undefined {
  if (!offer) return undefined;

  const direct = asNumber(offer.price) ?? asNumber(offer.lowPrice);
  if (direct) return direct;

  const spec = offer.priceSpecification;
  if (spec && typeof spec === "object") {
    const specs = Array.isArray(spec) ? spec : [spec];
    for (const entry of specs) {
      const value = asNumber((entry as Record<string, unknown>)?.price);
      if (value) return value;
    }
  }
  return undefined;
}

function firstOffer(offers: unknown): Record<string, unknown> | undefined {
  if (!offers) return undefined;
  if (Array.isArray(offers)) {
    // Bij meerdere varianten pakken we de goedkoopste; dat is de prijs die de shop toont.
    const parsed = offers
      .map((o) => (typeof o === "object" && o ? (o as Record<string, unknown>) : undefined))
      .filter((o): o is Record<string, unknown> => Boolean(o))
      .filter((o) => offerPrice(o) !== undefined)
      .sort((a, b) => (offerPrice(a) ?? Infinity) - (offerPrice(b) ?? Infinity));
    return parsed[0];
  }
  if (typeof offers === "object") {
    const obj = offers as Record<string, unknown>;
    if (obj.offers) return firstOffer(obj.offers);
    return obj;
  }
  return undefined;
}

function imageUrl(image: unknown, pageUrl: string): string | undefined {
  if (typeof image === "string") return absoluteUrl(pageUrl, image);
  if (Array.isArray(image)) return imageUrl(image[0], pageUrl);
  if (image && typeof image === "object") {
    const url = (image as Record<string, unknown>).url;
    if (typeof url === "string") return absoluteUrl(pageUrl, url);
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** Ziet eruit als een productpagina (Woo, Shopify, Magento, maatwerk). */
const LIJKT_PRODUCT = [/\/product(s)?\//i, /\/p\//i, /\.html?$/i];

/** Zeker geen productpagina: kost alleen tijd. */
const ZEKER_GEEN_PRODUCT = [
  /\/(faq|blog|nieuws|recept(en)?|over-ons|contact|klantenservice|account|cart|winkelwagen|checkout|login|zoeken|search)\b/i,
  /\/(page|tag|categorie|category|collections)\//i,
];

/**
 * Sorteert kandidaat-links op hoe waarschijnlijk het een productpagina is, en
 * gooit pagina's weg die dat zeker niet zijn. Zonder deze stap gaat het budget
 * op aan FAQ- en categoriepagina's.
 */
export function rankProductLinks(links: string[]): string[] {
  return links
    .map((link) => ({ link, score: scoreLink(link) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.link);
}

function scoreLink(link: string): number {
  const path = pathOf(link);
  if (ZEKER_GEEN_PRODUCT.some((re) => re.test(path))) return -1;
  return LIJKT_PRODUCT.some((re) => re.test(path)) ? 1 : 0;
}

function pathOf(link: string): string {
  try {
    return new URL(link).pathname;
  } catch {
    return link;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Productlinks uit een listing; ruw maar effectief over shopsystemen heen. */
export function productLinks(html: string, pageUrl: string): string[] {
  const links = new Set<string>();
  const origin = new URL(pageUrl).origin;
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = absoluteUrl(pageUrl, match[1]);
    if (!href.startsWith(origin)) continue;
    if (/\.(jpg|jpeg|png|webp|svg|css|js|pdf)(\?|$)/i.test(href)) continue;
    links.add(href.split("?")[0]);
  }
  return [...links];
}
