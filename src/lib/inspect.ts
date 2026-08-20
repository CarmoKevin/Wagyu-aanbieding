import { timeoutMs, userAgent } from "@/lib/http";

/** Ruwe fetch die fouten níét weggooit; alleen voor het inspectie-endpoint. */
export async function fetchRawText(url: string): Promise<{
  ok: boolean;
  status?: number;
  contentType?: string;
  body?: string;
  error?: string;
}> {
  try {
    const res = await plainFetch(url);
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") ?? undefined,
      body: res.ok ? body : body.slice(0, 300),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Welke product-API's antwoorden op dit domein, en met welke status? */
export async function probeEndpoints(origin: string): Promise<Record<string, string>> {
  const paden: Record<string, string> = {
    shopify: "/products.json?limit=1",
    wooV1: "/wp-json/wc/store/v1/products?per_page=1",
    wooZonderVersie: "/wp-json/wc/store/products?per_page=1",
    wpApi: "/wp-json/",
    sitemap: "/sitemap.xml",
  };

  const uitkomsten = await Promise.all(
    Object.entries(paden).map(async ([naam, pad]) => {
      try {
        const res = await plainFetch(`${origin}${pad}`);
        const body = await res.text();
        const kort = body.trim().slice(0, 60).replace(/\s+/g, " ");
        return [naam, `${res.status} — ${kort}`] as const;
      } catch (err) {
        return [naam, err instanceof Error ? err.message : String(err)] as const;
      }
    }),
  );

  return Object.fromEntries(uitkomsten);
}

function plainFetch(url: string): Promise<Response> {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs()),
    headers: {
      "user-agent": userAgent(),
      "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
    },
  });
}
