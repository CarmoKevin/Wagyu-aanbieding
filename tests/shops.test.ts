import { describe, expect, it } from "vitest";
import shops from "../config/shops.json";
import type { ShopConfig } from "@/lib/types";

const lijst = shops as ShopConfig[];

describe("config/shops.json", () => {
  it("bevat unieke ids", () => {
    const ids = lijst.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("heeft geldige https-urls zonder slash op het eind", () => {
    for (const shop of lijst) {
      expect(() => new URL(shop.url)).not.toThrow();
      expect(new URL(shop.url).protocol).toBe("https:");
      expect(shop.url.endsWith("/")).toBe(false);
    }
  });

  it("gebruikt alleen bekende adapters", () => {
    for (const shop of lijst) {
      expect(["auto", "shopify", "woocommerce", "jsonld"]).toContain(shop.adapter);
    }
  });

  it("heeft listingPaths die met een slash beginnen", () => {
    for (const shop of lijst) {
      for (const path of shop.listingPaths ?? []) {
        expect(path.startsWith("/")).toBe(true);
      }
    }
  });
});
