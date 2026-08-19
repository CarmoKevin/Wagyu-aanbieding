import { describe, expect, it } from "vitest";
import { isUnitPriced, parseWeightGrams, pricePerKg } from "@/lib/parse/weight";

describe("parseWeightGrams", () => {
  it("leest gewone gramnotaties", () => {
    expect(parseWeightGrams("Wagyu Entrecote A5 250 gram")).toBe(250);
    expect(parseWeightGrams("Wagyu Ribeye 300gr")).toBe(300);
    expect(parseWeightGrams("Wagyu picanha 800 g")).toBe(800);
  });

  it("rekent kilo's om", () => {
    expect(parseWeightGrams("Tomahawk 1,2 kg")).toBe(1200);
    expect(parseWeightGrams("Brisket 2.5kg")).toBe(2500);
    expect(parseWeightGrams("Wagyu pakket 1 kilo")).toBe(1000);
  });

  it("telt multipacks op", () => {
    expect(parseWeightGrams("Wagyu burgers 4 x 150 g")).toBe(600);
    expect(parseWeightGrams("2x250gr sukiyaki")).toBe(500);
  });

  it("neemt het midden van een bereik", () => {
    expect(parseWeightGrams("Wagyu entrecote 300-350 gram")).toBe(325);
  });

  it("negeert onzin en ontbrekende gewichten", () => {
    expect(parseWeightGrams("Wagyu Entrecote A5")).toBeUndefined();
    expect(parseWeightGrams("Kadobon 50 euro")).toBeUndefined();
    // 5 g vlees bestaat niet; de "A5" mag geen gewicht worden.
    expect(parseWeightGrams("Wagyu A5")).toBeUndefined();
  });

  it("laat zich niet foppen door duizendtallen", () => {
    expect(parseWeightGrams("Wagyu tomahawk 1.500 gram")).toBe(1500);
  });
});

describe("isUnitPriced", () => {
  it("herkent prijs per eenheid", () => {
    expect(isUnitPriced("Wagyu A5 prijs per 100 gram")).toBe(100);
    expect(isUnitPriced("per kilo")).toBe(1000);
    expect(isUnitPriced("Wagyu entrecote 250 gram")).toBeUndefined();
  });
});

describe("pricePerKg", () => {
  it("rekent de kiloprijs uit", () => {
    expect(pricePerKg(45, 250)).toBe(180);
    expect(pricePerKg(120, 1000)).toBe(120);
  });

  it("geeft niets terug zonder bruikbaar gewicht", () => {
    expect(pricePerKg(45, undefined)).toBeUndefined();
    expect(pricePerKg(45, 2)).toBeUndefined();
    expect(pricePerKg(0, 250)).toBeUndefined();
  });
});
