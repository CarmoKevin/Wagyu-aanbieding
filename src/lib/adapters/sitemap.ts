import { isExpired } from "@/lib/adapters";
import { fetchText } from "@/lib/http";
import { isAllowed } from "@/lib/robots";
import { isWagyu } from "@/lib/parse/classify";

/**
 * Productpagina's opsporen via de sitemap. Betrouwbaarder dan links rapen van
 * een categoriepagina: die laden hun producten vaak pas met JavaScript, wat wij
 * niet uitvoeren. Vrijwel elke webshop heeft een sitemap voor Google.
 */
const SITEMAP_PADEN = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"];
const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

export async function sitemapWagyuLinks(
  origin: string,
  deadline = Infinity,
  maxSubSitemaps = 3,
): Promise<string[]> {
  const xml = await eersteSitemap(origin, deadline);
  if (!xml) return [];

  const locs = lees(xml);
  const isIndex = /<sitemapindex/i.test(xml);

  if (!isIndex) return locs.filter((url) => isWagyu(decode(url)));

  // Een sitemap-index verwijst naar deelsitemaps; die met producten eerst.
  const kandidaten = locs
    .sort((a, b) => score(b) - score(a))
    .slice(0, maxSubSitemaps);

  const gevonden: string[] = [];
  for (const sub of kandidaten) {
    if (isExpired(deadline)) break;
    try {
      if (!(await isAllowed(sub))) continue;
      gevonden.push(...lees(await fetchText(sub)).filter((url) => isWagyu(decode(url))));
    } catch {
      // Eén onbereikbare deelsitemap mag de rest niet blokkeren.
    }
  }
  return gevonden;
}

async function eersteSitemap(origin: string, deadline: number): Promise<string | undefined> {
  for (const pad of SITEMAP_PADEN) {
    if (isExpired(deadline)) return undefined;
    const url = `${origin}${pad}`;
    try {
      if (!(await isAllowed(url))) continue;
      const xml = await fetchText(url);
      if (xml.includes("<loc")) return xml;
    } catch {
      // Volgend pad proberen.
    }
  }
  return undefined;
}

function lees(xml: string): string[] {
  return [...xml.matchAll(LOC_RE)].map((m) => m[1].trim());
}

/** Deelsitemaps met producten zijn interessanter dan die met blogposts. */
function score(url: string): number {
  const lower = url.toLowerCase();
  if (/product/.test(lower)) return 2;
  if (/(post|blog|categor|page|author|tag)/.test(lower)) return -1;
  return 0;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
