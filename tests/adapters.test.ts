import { describe, expect, it } from "vitest";
import { productsFromHtml } from "@/lib/adapters/jsonld";
import { parseRobots, pathAllowed } from "@/lib/robots";
import { parseSuggestions } from "@/lib/agent";
import type { ShopConfig } from "@/lib/types";

const shop: ShopConfig = { id: "s", name: "Shop", url: "https://shop.nl", adapter: "jsonld" };

describe("JSON-LD adapter", () => {
  it("leest een schema.org Product met offer", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Wagyu entrecote A5 250 gram",
       "image":"/img/wagyu.jpg","url":"/p/wagyu-entrecote",
       "offers":{"@type":"Offer","price":"59.95","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
    </script></head><body></body></html>`;

    const products = productsFromHtml(html, "https://shop.nl/wagyu", shop);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      title: "Wagyu entrecote A5 250 gram",
      price: 59.95,
      available: true,
      url: "https://shop.nl/p/wagyu-entrecote",
      image: "https://shop.nl/img/wagyu.jpg",
    });
  });

  it("pakt producten uit een @graph en een ItemList", () => {
    const html = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":"ItemList","itemListElement":[
        {"@type":"ListItem","item":{"@type":"Product","name":"Wagyu burger","url":"/p/1",
          "offers":{"@type":"Offer","price":"12,50"}}},
        {"@type":"ListItem","item":{"@type":"Product","name":"Wagyu picanha","url":"/p/2",
          "offers":[{"price":"89.00"},{"price":"45.00"}]}}
      ]}]}
    </script>`;

    const products = productsFromHtml(html, "https://shop.nl/wagyu", shop);
    expect(products.map((p) => [p.title, p.price])).toEqual([
      ["Wagyu burger", 12.5],
      ["Wagyu picanha", 45],
    ]);
  });

  it("negeert uitverkocht-status en kapotte JSON zonder te crashen", () => {
    const html = `
      <script type="application/ld+json">{ dit is geen json }</script>
      <script type="application/ld+json">
        {"@type":"Product","name":"Wagyu tomahawk","url":"/p/3",
         "offers":{"price":"149.00","availability":"http://schema.org/OutOfStock"}}
      </script>`;

    const products = productsFromHtml(html, "https://shop.nl/wagyu", shop);
    expect(products).toHaveLength(1);
    expect(products[0].available).toBe(false);
  });

  it("slaat producten zonder prijs over", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Wagyu cadeaubon","url":"/p/4"}</script>`;
    expect(productsFromHtml(html, "https://shop.nl/x", shop)).toHaveLength(0);
  });
});

describe("robots.txt", () => {
  const rules = parseRobots(`
    User-agent: *
    Disallow: /checkout
    Disallow: /account
    Allow: /account/public

    User-agent: BadBot
    Disallow: /
  `);

  it("blokkeert wat niet mag en laat de rest door", () => {
    expect(pathAllowed(rules, "/wagyu")).toBe(true);
    expect(pathAllowed(rules, "/checkout/cart")).toBe(false);
    expect(pathAllowed(rules, "/account/orders")).toBe(false);
  });

  it("laat een specifiekere Allow winnen", () => {
    expect(pathAllowed(rules, "/account/public/list")).toBe(true);
  });

  it("negeert regels voor andere user-agents", () => {
    expect(pathAllowed(rules, "/")).toBe(true);
  });
});

describe("parseSuggestions", () => {
  it("haalt JSON uit een codeblok", () => {
    const text = 'Gevonden:\n```json\n[{"name":"Shop","url":"https://shop.nl","reden":"test"}]\n```';
    expect(parseSuggestions(text)).toEqual([{ name: "Shop", url: "https://shop.nl", reden: "test" }]);
  });

  it("geeft een lege lijst bij onbruikbare output", () => {
    expect(parseSuggestions("geen idee")).toEqual([]);
  });
});

describe("env-parsing", () => {
  it("negeert lege en onzinnige waarden", async () => {
    const { envNumber, envString, envIsSet } = await import("@/lib/env");

    // Precies het geval dat de scan sloopte: variabele bestaat, maar is leeg.
    process.env.TEST_TIMEOUT = "";
    expect(envNumber("TEST_TIMEOUT", 12_000, { min: 1_000 })).toBe(12_000);
    expect(envIsSet("TEST_TIMEOUT")).toBe(false);
    expect(envString("TEST_TIMEOUT", "standaard")).toBe("standaard");

    process.env.TEST_TIMEOUT = "   ";
    expect(envNumber("TEST_TIMEOUT", 12_000, { min: 1_000 })).toBe(12_000);

    process.env.TEST_TIMEOUT = "abc";
    expect(envNumber("TEST_TIMEOUT", 12_000, { min: 1_000 })).toBe(12_000);

    // Een te lage waarde wordt opgetrokken, niet klakkeloos overgenomen.
    process.env.TEST_TIMEOUT = "0";
    expect(envNumber("TEST_TIMEOUT", 12_000, { min: 1_000 })).toBe(1_000);

    process.env.TEST_TIMEOUT = "5000";
    expect(envNumber("TEST_TIMEOUT", 12_000, { min: 1_000 })).toBe(5_000);
    expect(envIsSet("TEST_TIMEOUT")).toBe(true);

    delete process.env.TEST_TIMEOUT;
    expect(envNumber("TEST_TIMEOUT", 12_000, { min: 1_000 })).toBe(12_000);
  });
});

describe("rankProductLinks", () => {
  it("zet productpagina's voorop en gooit ruis weg", async () => {
    const { rankProductLinks } = await import("@/lib/adapters/jsonld");

    const gerangschikt = rankProductLinks([
      "https://shop.nl/faq/wagyu/",
      "https://shop.nl/wagyu-vlees/page/2/",
      "https://shop.nl/iets-met-wagyu",
      "https://shop.nl/product/wagyu-ribeye-a5/",
      "https://shop.nl/japanse-wagyu-entrecote-grade-4.html",
    ]);

    // FAQ- en paginering-links kosten alleen tijd: weg ermee.
    expect(gerangschikt).not.toContain("https://shop.nl/faq/wagyu/");
    expect(gerangschikt).not.toContain("https://shop.nl/wagyu-vlees/page/2/");

    // /product/ en .html zien er als productpagina uit en gaan voorop.
    expect(gerangschikt.slice(0, 2)).toEqual(
      expect.arrayContaining([
        "https://shop.nl/product/wagyu-ribeye-a5/",
        "https://shop.nl/japanse-wagyu-entrecote-grade-4.html",
      ]),
    );
    // Onbekende vorm mag blijven, maar achteraan.
    expect(gerangschikt.at(-1)).toBe("https://shop.nl/iets-met-wagyu");
  });
});

describe("retryAfterMs", () => {
  it("wacht kort als de shop geen voorkeur geeft", async () => {
    const { retryAfterMs } = await import("@/lib/http");
    expect(retryAfterMs(null)).toBe(500);
  });

  it("volgt een redelijke Retry-After", async () => {
    const { retryAfterMs } = await import("@/lib/http");
    expect(retryAfterMs("2")).toBe(2_000);
    expect(retryAfterMs("0")).toBe(250);
  });

  it("geeft het op als de shop lang wil wachten of onzin stuurt", async () => {
    const { retryAfterMs } = await import("@/lib/http");
    expect(retryAfterMs("120")).toBeUndefined();
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
  });
});
