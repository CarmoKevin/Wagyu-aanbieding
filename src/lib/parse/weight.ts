/**
 * Gewicht uit vrije tekst halen. Webshops schrijven van alles:
 * "250 gram", "±300 gr", "1,2 kg", "4 x 150g", "ca. 500 gram", "300-350 gram".
 */

const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  gramm: 1,
  kg: 1000,
  kilo: 1000,
  kilogram: 1000,
};

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const UNIT = String.raw`(kilogram|kilo|kg|grams|gramm|gram|gr|g)\b`;

// "4 x 150 g" / "2x250gr"
const MULTI = new RegExp(String.raw`(\d+)\s*[x×]\s*(${NUM})\s*${UNIT}`, "i");
// "300-350 gram" -> gemiddelde
const RANGE = new RegExp(String.raw`(${NUM})\s*-\s*(${NUM})\s*${UNIT}`, "i");
// "250 gram" / "1,2kg" / "±300 g"
const SINGLE = new RegExp(String.raw`(${NUM})\s*${UNIT}`, "i");

function toNumber(raw: string): number {
  return Number(raw.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
}

function unitFactor(unit: string): number {
  return UNIT_TO_GRAMS[unit.toLowerCase()] ?? 1;
}

/**
 * Geeft het totale gewicht in gram, of undefined als er niets bruikbaars staat.
 * Bij meerdere matches wint de eerste plausibele (10 g - 20 kg).
 */
export function parseWeightGrams(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const haystack = text.replace(/&nbsp;/g, " ").toLowerCase();

  const multi = MULTI.exec(haystack);
  if (multi) {
    const grams = Number(multi[1]) * toNumber(multi[2]) * unitFactor(multi[3]);
    if (isPlausible(grams)) return grams;
  }

  const range = RANGE.exec(haystack);
  if (range) {
    const grams = ((toNumber(range[1]) + toNumber(range[2])) / 2) * unitFactor(range[3]);
    if (isPlausible(grams)) return grams;
  }

  // Alle losse matches langslopen; sla onzin zoals "A5 5 g" of jaartallen over.
  for (const m of haystack.matchAll(new RegExp(SINGLE.source, "gi"))) {
    const grams = toNumber(m[1]) * unitFactor(m[2]);
    if (isPlausible(grams)) return grams;
  }
  return undefined;
}

/** Vlees onder 10 gram of boven 20 kg is vrijwel zeker een parseerfout. */
export function isPlausible(grams: number): boolean {
  return Number.isFinite(grams) && grams >= 10 && grams <= 20_000;
}

/** Herkent "per 100 gram"-prijzen; die moeten anders omgerekend worden. */
export function isUnitPriced(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const m = /per\s*(\d+(?:[.,]\d+)?)?\s*(kilogram|kilo|kg|gram|gr|g)\b/i.exec(text);
  if (!m) return undefined;
  // "per kilo" zonder getal betekent 1 eenheid.
  const grams = (m[1] ? toNumber(m[1]) : 1) * unitFactor(m[2]);
  return isPlausible(grams) ? grams : undefined;
}

export function pricePerKg(price: number, grams: number | undefined): number | undefined {
  if (!grams || !isPlausible(grams) || !(price > 0)) return undefined;
  return (price / grams) * 1000;
}
