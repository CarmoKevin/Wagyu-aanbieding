import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Prijshistorie. Nodig voor shops die geen van-prijs publiceren: dan bepalen we
 * de korting zelf t.o.v. de mediaan van eerdere metingen (in de geest van de
 * Omnibus-richtlijn: niet de adviesprijs, maar wat het echt kostte).
 *
 * Backends, in volgorde van voorkeur:
 *  1. Upstash / Vercel KV via REST  (KV_REST_API_URL + KV_REST_API_TOKEN)
 *  2. lokaal bestand data/history.json  (alleen buiten Vercel)
 *  3. geheugen  (werkt, maar leeg na een cold start)
 */
export type PricePoint = { d: string; p: number };
export type History = Record<string, PricePoint[]>;

const KEY = "wagyu:history";
const MAX_POINTS = 16;
const MAX_AGE_DAYS = 60;

const memory: { data: History } = { data: {} };

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

const localFile = path.join(process.cwd(), "data", "history.json");
const canUseFile = !process.env.VERCEL;

export async function loadHistory(): Promise<History> {
  const kv = kvConfig();
  if (kv) {
    try {
      const res = await fetch(`${kv.url}/get/${KEY}`, {
        headers: { authorization: `Bearer ${kv.token}` },
        cache: "no-store",
      });
      const body = (await res.json()) as { result?: string | null };
      return body.result ? (JSON.parse(body.result) as History) : {};
    } catch {
      return memory.data;
    }
  }

  if (canUseFile) {
    try {
      return JSON.parse(await fs.readFile(localFile, "utf8")) as History;
    } catch {
      return memory.data;
    }
  }

  return memory.data;
}

export async function saveHistory(history: History): Promise<void> {
  memory.data = history;
  const kv = kvConfig();
  if (kv) {
    try {
      await fetch(`${kv.url}/set/${KEY}`, {
        method: "POST",
        headers: { authorization: `Bearer ${kv.token}`, "content-type": "application/json" },
        body: JSON.stringify(history),
      });
    } catch {
      // Historie is een bonus; een mislukte schrijfactie mag de scan niet slopen.
    }
    return;
  }

  if (canUseFile) {
    try {
      await fs.mkdir(path.dirname(localFile), { recursive: true });
      await fs.writeFile(localFile, JSON.stringify(history), "utf8");
    } catch {
      // idem
    }
  }
}

/** Voegt de metingen van vandaag toe en snoeit oude/overtollige punten. */
export function appendPrices(
  history: History,
  points: { id: string; price: number }[],
  today = new Date().toISOString().slice(0, 10),
): History {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const next: History = { ...history };

  for (const { id, price } of points) {
    const existing = (next[id] ?? []).filter((p) => p.d >= cutoff);
    const withoutToday = existing.filter((p) => p.d !== today);
    next[id] = [...withoutToday, { d: today, p: price }].slice(-MAX_POINTS);
  }

  // Producten die al lang niet meer gezien zijn, laten we vallen.
  for (const [id, points_] of Object.entries(next)) {
    if (points_.every((p) => p.d < cutoff)) delete next[id];
  }
  return next;
}

export function storageBackend(): "kv" | "file" | "memory" {
  if (kvConfig()) return "kv";
  return canUseFile ? "file" : "memory";
}
