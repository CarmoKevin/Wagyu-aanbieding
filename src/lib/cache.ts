import { scanAll } from "@/lib/deals";
import type { ScanResult } from "@/lib/types";

/**
 * Simpele in-memory cache per serverless-instantie. De cron ververst één keer
 * per dag; bezoekers daartussen krijgen het laatste resultaat en betalen dus
 * geen wachttijd (en de shops geen extra verkeer).
 */
const TTL_MS = Number(process.env.DEALS_TTL_MINUTES ?? 180) * 60_000;

let cached: ScanResult | null = null;
let cachedAt = 0;
let inFlight: Promise<ScanResult> | null = null;

export async function getDeals(options: { force?: boolean } = {}): Promise<ScanResult> {
  const fresh = cached && Date.now() - cachedAt < TTL_MS;
  if (fresh && !options.force) return cached!;

  // Meerdere gelijktijdige bezoekers delen dezelfde scan.
  inFlight ??= refreshDeals({ withSummary: !cached }).finally(() => {
    inFlight = null;
  });

  try {
    return await inFlight;
  } catch (err) {
    if (cached) return cached; // liever oude data dan een lege pagina
    throw err;
  }
}

export async function refreshDeals(options: { withSummary?: boolean } = {}): Promise<ScanResult> {
  const result = await scanAll(options);
  // Een lege scan (alle shops down) mag een goede cache niet overschrijven.
  if (result.deals.length > 0 || !cached) {
    cached = { ...result, summary: result.summary ?? cached?.summary };
    cachedAt = Date.now();
  }
  return cached ?? result;
}

export function peekCache(): { at: number; result: ScanResult | null } {
  return { at: cachedAt, result: cached };
}
