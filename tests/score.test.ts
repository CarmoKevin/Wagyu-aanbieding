import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/normalize";
import { buildBenchmarks, median, scoreAll, scoreDeal } from "@/lib/score";
import type { RawProduct } from "@/lib/types";

function product(overrides: Partial<RawProduct> = {}): RawProduct {
  return {
    shopId: "test",
    shopName: "Testshop",
    url: `https://test.nl/p/${overrides.title ?? "x"}`,
    title: "Japanse Wagyu entrecote A5 250 gram",
    price: 60,
    available: true,
    via: "shopify",
    ...overrides,
  };
}

describe("scoreDeal", () => {
  const markt = [
    normalize(product({ title: "Japanse Wagyu entrecote A5 250 gram", price: 60, url: "a" })),
    normalize(product({ title: "Japanse Wagyu entrecote A5 300 gram", price: 75, url: "b" })),
    normalize(product({ title: "Japanse Wagyu entrecote A5 200 gram", price: 48, url: "c" })),
  ];
  const benchmarks = buildBenchmarks(markt);

  it("beloont een lage kiloprijs binnen hetzelfde segment", () => {
    const goedkoop = normalize(
      product({ title: "Japanse Wagyu entrecote A5 250 gram", price: 35, url: "d" }),
    );
    const duur = normalize(
      product({ title: "Japanse Wagyu entrecote A5 250 gram", price: 95, url: "e" }),
    );

    expect(scoreDeal(goedkoop, benchmarks).score).toBeGreaterThan(scoreDeal(duur, benchmarks).score);
  });

  it("laat korting meetellen", () => {
    const zonder = normalize(product({ price: 60, url: "f" }));
    const met = normalize(product({ price: 60, compareAtPrice: 100, url: "g" }));

    expect(scoreDeal(met, benchmarks).score).toBeGreaterThan(scoreDeal(zonder, benchmarks).score);
    expect(met.discountPct).toBe(40);
  });

  it("straft ontbrekende kiloprijs af, want dan is de deal niet te controleren", () => {
    const metGewicht = normalize(product({ price: 60, compareAtPrice: 100, url: "h" }));
    const zonderGewicht = normalize(
      product({ title: "Japanse Wagyu entrecote A5", price: 60, compareAtPrice: 100, url: "i" }),
    );

    expect(zonderGewicht.pricePerKg).toBeUndefined();
    expect(scoreDeal(zonderGewicht, benchmarks).score).toBeLessThan(
      scoreDeal(metGewicht, benchmarks).score,
    );
  });

  it("zet uitverkochte producten onderaan", () => {
    const beschikbaar = normalize(product({ price: 35, url: "j" }));
    const uitverkocht = normalize(product({ price: 35, url: "k", available: false }));

    expect(scoreDeal(uitverkocht, benchmarks).score).toBeLessThan(
      scoreDeal(beschikbaar, benchmarks).score,
    );
    expect(scoreDeal(uitverkocht, benchmarks).reasons).toContain("uitverkocht");
  });

  it("vergelijkt niet met een ander segment", () => {
    // Gehakt is spotgoedkoop per kilo; dat mag A5-entrecote niet laten zakken.
    const gehakt = normalize(
      product({ title: "Iers wagyu gehakt 500 gram", price: 9, url: "l" }),
    );
    const gescoord = scoreDeal(gehakt, buildBenchmarks([...markt, gehakt]));
    expect(gescoord.reasons.some((r) => r.includes("onder de mediaan"))).toBe(false);
  });

  it("houdt de score binnen 0-100", () => {
    const extreem = normalize(product({ price: 1, compareAtPrice: 500, url: "m" }));
    const gescoord = scoreDeal(extreem, benchmarks);
    expect(gescoord.score).toBeLessThanOrEqual(100);
    expect(gescoord.score).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreAll", () => {
  it("sorteert aflopend op score", () => {
    const deals = scoreAll([
      normalize(product({ title: "Japanse Wagyu entrecote A5 250 gram", price: 90, url: "n" })),
      normalize(product({ title: "Japanse Wagyu entrecote A5 250 gram", price: 30, compareAtPrice: 60, url: "o" })),
      normalize(product({ title: "Japanse Wagyu entrecote A5 250 gram", price: 60, url: "p" })),
    ]);
    expect(deals[0].price).toBe(30);
    expect(deals.map((d) => d.score)).toEqual([...deals.map((d) => d.score)].sort((a, b) => b - a));
  });
});

describe("median", () => {
  it("werkt bij even en oneven aantallen", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });
});
