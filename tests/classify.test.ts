import { describe, expect, it } from "vitest";
import { isWagyu, parseCut, parseGrade, parseOrigin, segmentKey } from "@/lib/parse/classify";

describe("isWagyu", () => {
  it("herkent wagyu en kobe", () => {
    expect(isWagyu("Wagyu Entrecote", undefined, undefined, [])).toBe(true);
    expect(isWagyu("Kobe beef striploin")).toBe(true);
    expect(isWagyu("Rundvlees", undefined, undefined, ["Wagyu", "Rund"])).toBe(true);
  });

  it("laat gewoon rundvlees links liggen", () => {
    expect(isWagyu("Iberico secreto", "500 gram")).toBe(false);
    expect(isWagyu("Black Angus ribeye")).toBe(false);
  });
});

describe("parseGrade", () => {
  it("leest Japanse grades", () => {
    expect(parseGrade("Wagyu entrecote A5 Kagoshima")).toBe("A5");
    expect(parseGrade("wagyu a4 miyazaki")).toBe("A4");
  });

  it("leest marbling scores", () => {
    expect(parseGrade("Australische wagyu BMS 8-9")).toBe("BMS 8-9");
    expect(parseGrade("Wagyu MB 9 striploin")).toBe("BMS 9+");
    expect(parseGrade("NSW wagyu 8+ ribeye")).toBe("BMS 8+");
  });

  it("geeft niets bij ontbrekende grade", () => {
    expect(parseGrade("Wagyu burger 150 gram")).toBeUndefined();
  });
});

describe("parseOrigin", () => {
  it("leidt de herkomst af", () => {
    expect(parseOrigin("Japanse wagyu A5")).toBe("japans");
    expect(parseOrigin("Kagoshima entrecote")).toBe("japans");
    expect(parseOrigin("Australische wagyu MB7")).toBe("australisch");
    expect(parseOrigin("Iers wagyu gehakt")).toBe("iers");
    expect(parseOrigin("Wagyu uit Nederlandse weide")).toBe("nederlands");
    expect(parseOrigin("Wagyu entrecote")).toBe("onbekend");
  });
});

describe("parseCut", () => {
  it("herkent deelstukken, specifiek voor generiek", () => {
    expect(parseCut("Wagyu tomahawk 1,2 kg")).toBe("Tomahawk");
    expect(parseCut("Wagyu short rib")).toBe("Short rib");
    expect(parseCut("Wagyu ribeye")).toBe("Ribeye / entrecote");
    expect(parseCut("Wagyu entrecôte")).toBe("Ribeye / entrecote");
    expect(parseCut("Wagyu tournedos")).toBe("Ossenhaas / tournedos");
    expect(parseCut("Wagyu proefpakket")).toBe("Pakket / box");
    expect(parseCut("Wagyu iets onbekends")).toBeUndefined();
  });
});

describe("segmentKey", () => {
  it("groepeert vergelijkbaar vlees", () => {
    expect(segmentKey("japans", "A5", "Ribeye / entrecote")).toBe("japans|A5|Ribeye / entrecote");
    expect(segmentKey("australisch", "BMS 8-9", "Burger")).toBe("australisch|bms|Burger");
    expect(segmentKey("onbekend", undefined, undefined)).toBe("onbekend|geen|overig");
  });
});
