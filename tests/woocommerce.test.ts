import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchWooCommerce } from "@/lib/adapters/woocommerce";
import { fetchText, RateLimitedError } from "@/lib/http";
import type { ShopConfig } from "@/lib/types";

function wooProduct(id: number, name: string, price: string, regular = price) {
  return {
    id,
    name,
    permalink: `https://shop.nl/product/${id}`,
    is_in_stock: true,
    prices: { price, regular_price: regular, currency_minor_unit: 2 },
    categories: [{ name: "Rundvlees" }],
  };
}

let server: http.Server;
let base: string;
let pogingen429 = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (body: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === "/robots.txt") {
      res.writeHead(404);
      return res.end();
    }

    if (url.pathname === "/wp-json/wc/store/v1/products") {
      const page = Number(url.searchParams.get("page") ?? 1);
      // Zoals Internetslagerij: search=wagyu levert niets op.
      if (url.searchParams.has("search")) return json([]);
      if (page > 1) return json([]);
      return json([
        wooProduct(1, "Wagyu ribeye 300 gram", "4995", "6995"),
        wooProduct(2, "Black Angus ribeye 300 gram", "1995"),
        wooProduct(3, "Wagyu burger 2 x 150 gram", "1250"),
      ]);
    }

    if (url.pathname === "/traag-eerst") {
      pogingen429++;
      if (pogingen429 === 1) {
        res.writeHead(429, { "retry-after": "0", "content-type": "text/plain" });
        return res.end("rustig aan");
      }
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("gelukt");
    }

    if (url.pathname === "/altijd-429") {
      res.writeHead(429, { "retry-after": "0" });
      return res.end("nee");
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("WooCommerce zonder bruikbare zoekfunctie", () => {
  it("valt terug op de hele catalogus en zeeft zelf op wagyu", async () => {
    const shop: ShopConfig = { id: "w", name: "Woo", url: base, adapter: "woocommerce" };
    const producten = await fetchWooCommerce(shop);

    expect(producten.map((p) => p.title)).toEqual([
      "Wagyu ribeye 300 gram",
      "Wagyu burger 2 x 150 gram",
    ]);
    // Prijzen komen in centen binnen en moeten euro's worden.
    expect(producten[0].price).toBe(49.95);
    expect(producten[0].compareAtPrice).toBe(69.95);
  });
});

describe("omgaan met HTTP 429", () => {
  it("wacht netjes en probeert het één keer opnieuw", async () => {
    await expect(fetchText(`${base}/traag-eerst`)).resolves.toBe("gelukt");
    expect(pogingen429).toBe(2);
  });

  it("geeft het op met een duidelijke melding als de shop blijft weigeren", async () => {
    await expect(fetchText(`${base}/altijd-429`)).rejects.toThrow(RateLimitedError);
    await expect(fetchText(`${base}/altijd-429`)).rejects.toThrow(/weert geautomatiseerd verkeer/);
  });
});
