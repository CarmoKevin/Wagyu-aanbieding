import { segmentKey } from "@/lib/parse/classify";
import { round } from "@/lib/normalize";
import type { Deal } from "@/lib/types";

/**
 * De dealscore (0-100) weegt twee dingen die de gebruiker gevraagd heeft:
 * hoeveel korting er is, en hoe goed de kiloprijs is vergeleken met soortgelijk
 * vlees elders. Een "50% korting" op een absurde adviesprijs scoort dus niet
 * automatisch hoog: zonder goede kiloprijs blijft de helft van de score liggen.
 */
export const WEIGHTS = { discount: 0.45, value: 0.55 } as const;

/** Minimaal aantal vergelijkbare producten voordat een mediaan iets zegt. */
const MIN_SEGMENT_SIZE = 3;

export type Benchmarks = {
  /** Mediane kiloprijs per segment (herkomst + grade + deelstuk). */
  bySegment: Map<string, number>;
  /** Mediane kiloprijs per grade + deelstuk, over herkomsten heen. */
  byGradeCut: Map<string, number>;
  /** Mediane kiloprijs per deelstuk. */
  byCut: Map<string, number>;
};

export function buildBenchmarks(deals: Deal[]): Benchmarks {
  const withPrice = deals.filter((d) => d.pricePerKg && d.pricePerKg > 0);

  const segment = new Map<string, number[]>();
  const gradeCut = new Map<string, number[]>();
  const cut = new Map<string, number[]>();

  for (const deal of withPrice) {
    const key = segmentKey(deal.origin, deal.grade, deal.cut);
    const [, gradeBucket, cutBucket] = key.split("|");
    push(segment, key, deal.pricePerKg!);
    push(gradeCut, `${gradeBucket}|${cutBucket}`, deal.pricePerKg!);
    push(cut, cutBucket, deal.pricePerKg!);
  }

  return {
    bySegment: medians(segment, MIN_SEGMENT_SIZE),
    byGradeCut: medians(gradeCut, MIN_SEGMENT_SIZE),
    byCut: medians(cut, MIN_SEGMENT_SIZE),
  };
}

/**
 * De referentieprijs waartegen deze deal wordt afgezet. We vergelijken alleen
 * met hetzelfde deelstuk: gehakt afzetten tegen de mediaan van alle wagyu zou
 * gehakt altijd als koopje van de dag aanwijzen.
 */
export function referencePrice(
  deal: Deal,
  benchmarks: Benchmarks,
): { value: number; label: string } | undefined {
  const key = segmentKey(deal.origin, deal.grade, deal.cut);
  const [, gradeBucket, cutBucket] = key.split("|");
  const cutLabel = deal.cut ?? "vergelijkbaar vlees";

  const segment = benchmarks.bySegment.get(key);
  if (segment) return { value: segment, label: `${deal.origin} ${cutLabel}`.toLowerCase() };

  const gradeCut = benchmarks.byGradeCut.get(`${gradeBucket}|${cutBucket}`);
  if (gradeCut) {
    return { value: gradeCut, label: `${deal.grade ?? "ongegradeerde"} ${cutLabel}`.toLowerCase() };
  }

  const cut = benchmarks.byCut.get(cutBucket);
  if (cut) return { value: cut, label: cutLabel.toLowerCase() };

  return undefined;
}

export function scoreDeal(deal: Deal, benchmarks: Benchmarks): Deal {
  const reasons: string[] = [];

  // 1. Kortingscomponent: 40% korting of meer is maximaal.
  const discount = deal.discountPct ?? 0;
  const discountComponent = clamp(discount / 40, 0, 1);
  if (discount >= 5) {
    reasons.push(
      `${round(discount, 0)}% korting${deal.discountBasis === "history" ? " t.o.v. eerdere prijs" : ""}`,
    );
  }

  // 2. Waardecomponent: hoeveel goedkoper per kilo dan vergelijkbaar vlees.
  let valueComponent = 0;
  const reference = referencePrice(deal, benchmarks);
  if (deal.pricePerKg && reference) {
    const delta = (reference.value - deal.pricePerKg) / reference.value;
    valueComponent = clamp(delta / 0.4, 0, 1);
    if (delta >= 0.1) {
      reasons.push(`${round(delta * 100, 0)}% onder de mediaan van ${reference.label}`);
    } else if (delta <= -0.25) {
      reasons.push(`duurder per kilo dan ${reference.label}`);
    }
  } else if (!deal.pricePerKg) {
    reasons.push("geen gewicht bekend, kiloprijs niet te bepalen");
  } else {
    reasons.push("nog geen vergelijkbaar aanbod om de kiloprijs tegen af te zetten");
  }

  let score = 100 * (WEIGHTS.discount * discountComponent + WEIGHTS.value * valueComponent);

  // Zonder kiloprijs kunnen we de helft van het verhaal niet checken.
  if (!deal.pricePerKg) score *= 0.6;
  if (!deal.available) {
    score *= 0.25;
    reasons.push("uitverkocht");
  }
  if (deal.cut === "Pakket / box") {
    // Pakketten mengen deelstukken; kiloprijs is dan niet eerlijk vergelijkbaar.
    score *= 0.85;
  }

  if (deal.pricePerKg) {
    reasons.push(`€ ${round(deal.pricePerKg, 0)} per kilo`);
  }

  return { ...deal, score: round(score, 1), reasons };
}

export function scoreAll(deals: Deal[]): Deal[] {
  const benchmarks = buildBenchmarks(deals);
  return deals
    .map((deal) => scoreDeal(deal, benchmarks))
    .sort((a, b) => b.score - a.score || (a.pricePerKg ?? Infinity) - (b.pricePerKg ?? Infinity));
}

function push(map: Map<string, number[]>, key: string, value: number): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function medians(buckets: Map<string, number[]>, minSize: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, values] of buckets) {
    if (values.length < minSize) continue;
    const m = median(values);
    if (m) out.set(key, m);
  }
  return out;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
