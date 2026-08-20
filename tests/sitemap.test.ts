import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sitemapWagyuLinks } from "@/lib/adapters/sitemap";

let server: http.Server;
let base: string;
const opgevraagd: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    opgevraagd.push(req.url ?? "");
    const xml = (body: string) => {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
    };

    if (req.url === "/sitemap.xml") {
      return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>${base}/post-sitemap.xml</loc></sitemap>
        <sitemap><loc>${base}/product-sitemap.xml</loc></sitemap>
      </sitemapindex>`);
    }

    if (req.url === "/product-sitemap.xml") {
      return xml(`<urlset>
        <url><loc>${base}/product/wagyu-short-ribs/</loc></url>
        <url><loc>${base}/product/wagyu-picanha/</loc></url>
        <url><loc>${base}/product/iberico-secreto/</loc></url>
      </urlset>`);
    }

    if (req.url === "/post-sitemap.xml") {
      return xml(`<urlset><url><loc>${base}/blog/wagyu-bakken/</loc></url></urlset>`);
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("sitemapWagyuLinks", () => {
  it("volgt de index en houdt alleen wagyu-urls over", async () => {
    const links = await sitemapWagyuLinks(base);

    expect(links).toContain(`${base}/product/wagyu-short-ribs/`);
    expect(links).toContain(`${base}/product/wagyu-picanha/`);
    // Geen wagyu: hoort er niet in.
    expect(links).not.toContain(`${base}/product/iberico-secreto/`);
  });

  it("pakt de product-sitemap vóór de blog-sitemap", async () => {
    opgevraagd.length = 0;
    await sitemapWagyuLinks(base, Infinity, 1);
    expect(opgevraagd).toContain("/product-sitemap.xml");
    expect(opgevraagd).not.toContain("/post-sitemap.xml");
  });

  it("geeft niets terug als er geen sitemap is", async () => {
    await expect(sitemapWagyuLinks(`${base}/bestaat-niet`)).resolves.toEqual([]);
  });
});
