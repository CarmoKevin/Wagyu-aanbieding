const UA =
  process.env.SCRAPER_USER_AGENT ??
  "wagyu-aanbieding/0.1 (+https://github.com/CarmoKevin/Wagyu-aanbieding) hobby prijsvergelijker";

const DEFAULT_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 12_000);

export class HttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`HTTP ${status} voor ${url}`);
  }
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetchRaw(url, init);
  return res.text();
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchRaw(url, {
    ...init,
    headers: { accept: "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Geen geldige JSON van ${url} (eerste 80 tekens: ${body.slice(0, 80)})`);
  }
}

export async function fetchRaw(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": UA,
        "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return res;
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
