import { NextResponse } from "next/server";
import { productsFromHtml, jsonLdNodes, productLinks, rankProductLinks } from "@/lib/adapters/jsonld";
import { metaTags } from "@/lib/adapters/meta";
import { fetchRawText, probeEndpoints } from "@/lib/inspect";
import { normalize } from "@/lib/normalize";
import { isWagyu } from "@/lib/parse/classify";
import type { ShopConfig } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Röntgenfoto van één pagina: wat staat er aan schema.org-data in, wat maakt de
 * parser ervan, en welke product-API's antwoorden op dit domein? Bedoeld om een
 * shop die niets oplevert gericht te kunnen fixen.
 *
 *   /api/inspect?url=https://www.bbquality.nl/product/wagyu-short-ribs/
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "geef ?url=https://..." }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "ongeldige url" }, { status: 400 });
  }

  const shop: ShopConfig = {
    id: "inspect",
    name: "inspect",
    url: target.origin,
    adapter: "jsonld",
  };

  const [page, endpoints] = await Promise.all([
    fetchRawText(target.toString()),
    probeEndpoints(target.origin),
  ]);

  if (!page.ok) {
    return NextResponse.json({ url: target.toString(), page, endpoints });
  }

  const html = page.body ?? "";
  const nodes = jsonLdNodes(html);
  const producten = productsFromHtml(html, target.toString(), shop);
  const links = productLinks(html, target.toString()).filter((l) => isWagyu(l));

  return NextResponse.json({
    url: target.toString(),
    page: { ...page, body: undefined, bytes: html.length },
    endpoints,
    jsonLd: {
      blokken: nodes.length,
      types: nodes.flatMap(typesOf),
      // Zonder herkende producten: dit zijn de sleutels die er wél in staan.
      sleutels: producten.length === 0 ? nodes.flatMap(keysOf).slice(0, 40) : undefined,
    },
    gevonden: producten.map((p) => {
      const deal = normalize(p);
      return {
        titel: deal.title,
        prijs: deal.price,
        vanPrijs: deal.compareAtPrice,
        opVoorraad: deal.available,
        gewichtGram: deal.weightGrams,
        gewichtBron: deal.weightSource,
        prijsPerKilo: deal.pricePerKg,
        grade: deal.grade,
        herkomst: deal.origin,
        deelstuk: deal.cut,
        isWagyu: isWagyu(deal.title, deal.variantTitle, deal.productType, deal.tags),
      };
    }),
    openGraph: Object.fromEntries(
      [...metaTags(html)].filter(([key]) => /^(og:|product:|price|availability)/.test(key)),
    ),
    links: {
      wagyuKandidaten: links.length,
      naRangschikking: rankProductLinks(links).slice(0, 8),
    },
  });
}

function typesOf(node: unknown, depth = 0): string[] {
  if (!node || depth > 5) return [];
  if (Array.isArray(node)) return node.flatMap((n) => typesOf(n, depth + 1));
  if (typeof node !== "object") return [];

  const obj = node as Record<string, unknown>;
  const own = typeof obj["@type"] === "string" ? [obj["@type"] as string] : [];
  const kinderen = ["@graph", "itemListElement", "item", "mainEntity"].flatMap((key) =>
    typesOf(obj[key], depth + 1),
  );
  return [...own, ...kinderen];
}

function keysOf(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(keysOf);
  return Object.keys(node as Record<string, unknown>);
}
