import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchShop, isExpired, shopBudgetMs } from "@/lib/adapters";
import type { ShopConfig } from "@/lib/types";

let server: http.Server;
let base: string;
let requests = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests++;
    if (req.url?.startsWith("/robots.txt")) {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("User-agent: *\nDisallow: /checkout\n");
    }
    // Antwoordt nooit: een shop die blijft hangen.
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeAllConnections?.();
});

describe("tijdsbudget per shop", () => {
  it("kiest een veilig budget, ook bij een lege variabele", () => {
    process.env.SHOP_BUDGET_MS = "";
    expect(shopBudgetMs()).toBe(25_000);
    process.env.SHOP_BUDGET_MS = "0";
    expect(shopBudgetMs()).toBe(2_000);
    delete process.env.SHOP_BUDGET_MS;
    expect(shopBudgetMs()).toBe(25_000);
  });

  it("geeft op tijd op bij een shop die blijft hangen", async () => {
    process.env.FETCH_TIMEOUT_MS = "1000";
    const shop: ShopConfig = { id: "traag", name: "Trage shop", url: base, adapter: "auto" };

    const started = Date.now();
    const outcome = await fetchShop(shop, Date.now() + 1_500);
    const duur = Date.now() - started;

    expect(outcome.products).toHaveLength(0);
    expect(outcome.via).toBeUndefined();
    // Zonder budget zou dit drie adapters × 1 s = ~3 s duren.
    expect(duur).toBeLessThan(2_800);
    expect(outcome.errors.join(" ")).toContain("tijdsbudget op");
    delete process.env.FETCH_TIMEOUT_MS;
  }, 15_000);

  it("doet geen enkel verzoek als het budget al op is", async () => {
    const shop: ShopConfig = { id: "traag", name: "Trage shop", url: base, adapter: "auto" };
    const voor = requests;

    const outcome = await fetchShop(shop, Date.now() - 1);

    expect(requests).toBe(voor);
    expect(outcome.products).toHaveLength(0);
    expect(outcome.errors).toHaveLength(3);
  });

  it("isExpired kijkt naar de klok", () => {
    expect(isExpired(Date.now() - 1)).toBe(true);
    expect(isExpired(Date.now() + 10_000)).toBe(false);
  });
});
