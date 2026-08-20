import { envNumber, envString } from "@/lib/env";

const DEFAULT_UA =
  "wagyu-aanbieding/0.1 (+https://github.com/CarmoKevin/Wagyu-aanbieding) hobby prijsvergelijker";

/** Nooit korter dan een seconde: een timeout van 0 breekt alles direct af. */
export function timeoutMs(): number {
  return envNumber("FETCH_TIMEOUT_MS", 12_000, { min: 1_000, max: 60_000 });
}

export function userAgent(): string {
  return envString("SCRAPER_USER_AGENT", DEFAULT_UA);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} voor ${url}`);
  }
}

export class TimeoutError extends Error {
  constructor(
    readonly url: string,
    readonly ms: number,
  ) {
    super(`timeout na ${ms} ms voor ${url}`);
  }
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  return request(url, init, (res) => res.text());
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const body = await request(
    url,
    { ...init, headers: { accept: "application/json", ...(init.headers ?? {}) } },
    (res) => res.text(),
  );
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`geen geldige JSON van ${url} (begint met: ${body.slice(0, 80)})`);
  }
}

/**
 * De timeout dekt het hele verzoek inclusief het uitlezen van de body — anders
 * kan een shop die traag druppelt de functie alsnog laten hangen.
 */
async function request<T>(
  url: string,
  init: RequestInit,
  read: (res: Response) => Promise<T>,
): Promise<T> {
  const ms = timeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": userAgent(),
        "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return await read(res);
  } catch (err) {
    // Een afgebroken request zegt zelf niet waarom; dat maken we expliciet.
    if (controller.signal.aborted) throw new TimeoutError(url, ms);
    if (err instanceof HttpError) throw err;
    throw new Error(`${err instanceof Error ? err.message : String(err)} (${url})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Voert taken uit met een maximum aan gelijktijdige requests. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
