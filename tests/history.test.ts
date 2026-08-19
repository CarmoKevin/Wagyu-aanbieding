import { describe, expect, it } from "vitest";
import { appendPrices } from "@/lib/store";
import { withHistoryDiscount } from "@/lib/deals";
import { normalize } from "@/lib/normalize";
import type { RawProduct } from "@/lib/types";

const raw: RawProduct = {
  shopId: "test",
  shopName: "Testshop",
  url: "https://test.nl/p/wagyu",
  title: "Wagyu entrecote A5 250 gram",
  price: 40,
  available: true,
  via: "jsonld",
};

describe("appendPrices", () => {
  it("voegt de meting van vandaag toe", () => {
    const next = appendPrices({}, [{ id: "a", price: 10 }], "2026-08-19");
    expect(next.a).toEqual([{ d: "2026-08-19", p: 10 }]);
  });

  it("overschrijft een tweede meting op dezelfde dag", () => {
    const first = appendPrices({}, [{ id: "a", price: 10 }], "2026-08-19");
    const second = appendPrices(first, [{ id: "a", price: 12 }], "2026-08-19");
    expect(second.a).toEqual([{ d: "2026-08-19", p: 12 }]);
  });

  it("gooit metingen ouder dan 60 dagen weg", () => {
    const oud = { a: [{ d: "2020-01-01", p: 99 }] };
    const next = appendPrices(oud, [{ id: "a", price: 10 }], "2026-08-19");
    expect(next.a).toEqual([{ d: "2026-08-19", p: 10 }]);
  });
});

describe("withHistoryDiscount", () => {
  it("berekent korting t.o.v. de mediaan van eerdere prijzen", () => {
    const deal = normalize(raw);
    const met = withHistoryDiscount(deal, {
      [deal.id]: [
        { d: "2026-08-01", p: 50 },
        { d: "2026-08-05", p: 50 },
        { d: "2026-08-10", p: 52 },
      ],
    });
    expect(met.discountPct).toBe(20);
    expect(met.discountBasis).toBe("history");
  });

  it("doet niets met te weinig historie", () => {
    const deal = normalize(raw);
    const met = withHistoryDiscount(deal, { [deal.id]: [{ d: "2026-08-01", p: 50 }] });
    expect(met.discountPct).toBeUndefined();
  });

  it("laat de korting van de shop zelf staan", () => {
    const deal = normalize({ ...raw, compareAtPrice: 80 });
    const met = withHistoryDiscount(deal, {
      [deal.id]: [
        { d: "2026-08-01", p: 50 },
        { d: "2026-08-05", p: 50 },
        { d: "2026-08-10", p: 50 },
      ],
    });
    expect(met.discountPct).toBe(50);
    expect(met.discountBasis).toBe("shop");
  });

  it("verzint geen korting als de prijs juist gestegen is", () => {
    const deal = normalize(raw);
    const met = withHistoryDiscount(deal, {
      [deal.id]: [
        { d: "2026-08-01", p: 30 },
        { d: "2026-08-05", p: 32 },
        { d: "2026-08-10", p: 31 },
      ],
    });
    expect(met.discountPct).toBeUndefined();
  });
});
