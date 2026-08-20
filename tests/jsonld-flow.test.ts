import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchJsonLd } from "@/lib/adapters/jsonld";
import type { ShopConfig } from "@/lib/types";

let server: http.Server;
let base: string;
let opgevraagd: string[] = [];
/** Zet op false om een shop zonder sitemap na te doen. */
let sitemapAan = true;

function productPagina(naam: string, prijs: string): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify({
    "@graph": [
      {
        "@type": "ProductGroup",
        name: naam,
        hasVariant: [{ "@type": "Product", name: naam, offers: { price: prijs } }],
      },
    ],
  })}</script></head><body></body></html>`;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    opgevraagd.push(path);
    const send = (type: string, body: string) => {
      res.writeHead(200, { "content-type": type });
      res.end(body);
    };

    if (path === "/robots.txt") return send("text/plain", "User-agent: *\nDisallow: /checkout\n");

    if (path === "/sitemap.xml") {
      if (!sitemapAan) return res.writeHead(404).end();
      return send(
        "application/xml",
        `<?xml version="1.0"?><urlset>
          <url><loc>${base}/product/wagyu-short-ribs/</loc></url>
          <url><loc>${base}/product/wagyu-picanha/</loc></url>
          <url><loc>${base}/product/iberico-secreto/</loc></url>
        </urlset>`,
      );
    }

    // Categoriepagina laadt producten met JavaScript: alleen een link.
    if (path === "/wagyu-vlees/") {
      return send(
        "text/html",
        `<html><body><a href="/product/wagyu-short-ribs/">short ribs</a></body></html>`,
      );
    }

    if (path === "/product/wagyu-short-ribs/") return send("text/html", productPagina("Wagyu short ribs 1000 gram", "64.95"));
    if (path === "/product/wagyu-picanha/") return send("text/html", productPagina("Wagyu picanha 800 gram", "119.00"));

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  opgevraagd = [];
  sitemapAan = true;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function shop(): ShopConfig {
  return { id: "s", name: "Shop", url: base, adapter: "jsonld", listingPaths: ["/wagyu-vlees/"] };
}

describe("volgorde van de JSON-LD-adapter", () => {
  it("gebruikt de sitemap en laat de trage categoriepagina links liggen", async () => {
    const producten = await fetchJsonLd(shop());

    expect(producten.map((p) => p.title).sort()).toEqual([
      "Wagyu picanha 800 gram",
      "Wagyu short ribs 1000 gram",
    ]);
    // De categoriepagina is niet nodig als de sitemap al producten oplevert.
    expect(opgevraagd).not.toContain("/wagyu-vlees/");
    // En niet-wagyu wordt niet opgehaald.
    expect(opgevraagd).not.toContain("/product/iberico-secreto/");
  });

  it("valt terug op de categoriepagina als er geen sitemap is", async () => {
    sitemapAan = false;
    const producten = await fetchJsonLd(shop());

    expect(opgevraagd).toContain("/wagyu-vlees/");
    expect(producten.map((p) => p.title)).toEqual(["Wagyu short ribs 1000 gram"]);
  });

  it("start geen verzoeken meer als het budget bijna op is", async () => {
    const producten = await fetchJsonLd(shop(), Date.now() + 500);

    expect(producten).toHaveLength(0);
    expect(opgevraagd).not.toContain("/product/wagyu-short-ribs/");
  });
});
