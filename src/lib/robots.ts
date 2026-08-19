import { fetchText } from "@/lib/http";

/**
 * Minimale robots.txt-check: we lezen de Disallow-regels voor `*` en voor onze
 * eigen user-agent en weigeren paden die daaronder vallen. Geen volledige
 * RFC-implementatie, maar genoeg om netjes te blijven tegenover de shops.
 */
type Rules = { disallow: string[]; allow: string[] };

const cache = new Map<string, Promise<Rules>>();

async function loadRules(origin: string): Promise<Rules> {
  const cached = cache.get(origin);
  if (cached) return cached;

  const promise = (async (): Promise<Rules> => {
    try {
      const txt = await fetchText(`${origin}/robots.txt`);
      return parseRobots(txt);
    } catch {
      // Geen robots.txt of niet bereikbaar: dan gelden er geen beperkingen.
      return { disallow: [], allow: [] };
    }
  })();

  cache.set(origin, promise);
  return promise;
}

export function parseRobots(txt: string): Rules {
  const rules: Rules = { disallow: [], allow: [] };
  let applies = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase().includes("wagyu-aanbieding");
    } else if (applies && key === "disallow" && value) {
      rules.disallow.push(value);
    } else if (applies && key === "allow" && value) {
      rules.allow.push(value);
    }
  }
  return rules;
}

export function pathAllowed(rules: Rules, pathname: string): boolean {
  const match = (patterns: string[]) =>
    patterns
      .filter((p) => pathname.startsWith(p.replace(/\*$/, "")))
      .sort((a, b) => b.length - a.length)[0];

  const allow = match(rules.allow);
  const disallow = match(rules.disallow);
  if (!disallow) return true;
  if (allow && allow.length >= disallow.length) return true;
  return false;
}

export async function isAllowed(url: string): Promise<boolean> {
  if (process.env.IGNORE_ROBOTS === "1") return true;
  try {
    const parsed = new URL(url);
    const rules = await loadRules(parsed.origin);
    return pathAllowed(rules, parsed.pathname);
  } catch {
    return true;
  }
}

/** Alleen voor tests. */
export function __clearRobotsCache(): void {
  cache.clear();
}
