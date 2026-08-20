import { describe, expect, it } from "vitest";
import { productsFromHtml } from "@/lib/adapters/jsonld";
import { metaTags, productFromMeta } from "@/lib/adapters/meta";
import type { ShopConfig } from "@/lib/types";

const shop: ShopConfig = { id: "s", name: "Shop", url: "https://shop.nl", adapter: "jsonld" };

function script(json: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
}

describe("ProductGroup met varianten", () => {
  it("leest de varianten uit hasVariant", () => {
    // Vorm zoals WooCommerce hem voor een variabel product uitschrijft.
    const html = script({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ProductGroup",
          name: "Wagyu short ribs",
          url: "/product/wagyu-short-ribs/",
          hasVariant: [
            {
              "@type": "Product",
              name: "Wagyu short ribs 1000 gram",
              url: "/product/wagyu-short-ribs/?variant=1kg",
              offers: { "@type": "Offer", price: "64.95", availability: "https://schema.org/InStock" },
            },
            {
              "@type": "Product",
              name: "Wagyu short ribs 2000 gram",
              url: "/product/wagyu-short-ribs/?variant=2kg",
              offers: { "@type": "Offer", price: "119.95" },
            },
          ],
        },
        { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Hoe bereid ik dit?" }] },
      ],
    });

    const producten = productsFromHtml(html, "https://shop.nl/product/wagyu-short-ribs/", shop);

    expect(producten.map((p) => [p.title, p.price])).toEqual([
      ["Wagyu short ribs 1000 gram", 64.95],
      ["Wagyu short ribs 2000 gram", 119.95],
    ]);
  });

  it("gebruikt de groep zelf als die de prijs draagt", () => {
    const html = script({
      "@type": "ProductGroup",
      name: "Wagyu picanha 800 gram",
      url: "/product/wagyu-picanha/",
      offers: { "@type": "AggregateOffer", lowPrice: "89.00", highPrice: "129.00" },
    });

    const producten = productsFromHtml(html, "https://shop.nl/p", shop);
    expect(producten).toHaveLength(1);
    // Bij een prijsbereik tonen we de vanafprijs, net als de shop zelf.
    expect(producten[0].price).toBe(89);
  });

  it("vindt een prijs die in priceSpecification zit", () => {
    const html = script({
      "@type": "Product",
      name: "Wagyu entrecote 300 gram",
      url: "/p/1",
      offers: {
        "@type": "Offer",
        priceSpecification: { "@type": "UnitPriceSpecification", price: "74,50", priceCurrency: "EUR" },
      },
    });

    expect(productsFromHtml(html, "https://shop.nl/p", shop)[0].price).toBe(74.5);
  });
});

describe("OpenGraph-terugval", () => {
  const html = `<html><head>
    <title>Wagyu short ribs kopen | BBQ Shop</title>
    <meta property="og:title" content="Wagyu short ribs 1,2 kg" />
    <meta property="og:image" content="/img/ribs.jpg">
    <meta property="product:price:amount" content="64.95"/>
    <meta property="product:price:currency" content="EUR"/>
    <meta property="product:availability" content="in stock"/>
    <meta property="og:description" content="Heerlijke short ribs van wagyu.">
  </head><body></body></html>`;

  it("leest metatags ongeacht attribuutvolgorde", () => {
    const tags = metaTags('<meta content="12,50" property="product:price:amount">');
    expect(tags.get("product:price:amount")).toBe("12,50");
  });

  it("maakt een product van de OpenGraph-tags", () => {
    const product = productFromMeta(html, "https://shop.nl/product/wagyu-short-ribs/", shop);
    expect(product).toMatchObject({
      title: "Wagyu short ribs 1,2 kg",
      price: 64.95,
      available: true,
      image: "https://shop.nl/img/ribs.jpg",
    });
  });

  it("springt bij zonder JSON-LD", () => {
    const producten = productsFromHtml(html, "https://shop.nl/product/wagyu-short-ribs/", shop);
    expect(producten).toHaveLength(1);
    expect(producten[0].price).toBe(64.95);
  });

  it("laat JSON-LD voorgaan als die er wel is", () => {
    const metJsonLd =
      html + script({ "@type": "Product", name: "Wagyu short ribs 1,2 kg", url: "/p/x", offers: { price: "59.00" } });
    const producten = productsFromHtml(metJsonLd, "https://shop.nl/p", shop);
    expect(producten).toHaveLength(1);
    expect(producten[0].price).toBe(59);
  });

  it("negeert prijzen in een andere valuta", () => {
    const dollars = html.replace('content="EUR"', 'content="USD"');
    expect(productFromMeta(dollars, "https://shop.nl/p", shop)).toBeUndefined();
  });

  it("herkent uitverkocht", () => {
    const uit = html.replace('content="in stock"', 'content="out of stock"');
    expect(productFromMeta(uit, "https://shop.nl/p", shop)?.available).toBe(false);
  });
});
