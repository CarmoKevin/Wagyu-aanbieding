import type { Origin } from "@/lib/types";

/** Alles wat we als wagyu tellen. Kobe is per definitie wagyu, dus die telt mee. */
const WAGYU_HINTS = ["wagyu", "kobe", "kagoshima", "miyazaki", "matsusaka", "omi beef"];

export function isWagyu(...fields: (string | string[] | undefined)[]): boolean {
  const text = fields
    .flatMap((f) => (Array.isArray(f) ? f : [f]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return WAGYU_HINTS.some((hint) => text.includes(hint));
}

/**
 * Kwaliteitsaanduiding: Japanse yield/marbling grade (A5, A4), Australische
 * marbling score (BMS/MB 4-12) of niets.
 */
export function parseGrade(text: string): string | undefined {
  const t = text.toLowerCase();

  const jp = /\b(a[3-5])\s*(?:\+|plus)?\b/.exec(t);
  if (jp) return jp[1].toUpperCase();

  const bms = /\b(?:bms|mb|marbling(?:\s*score)?)\s*[:\-]?\s*(\d{1,2})\s*(?:[-–+]\s*(\d{1,2}))?/.exec(t);
  if (bms) {
    const from = bms[1];
    const to = bms[2];
    return to ? `BMS ${from}-${to}` : `BMS ${from}+`;
  }

  const loose = /\bwagyu\s*(\d{1,2})\s*\+/.exec(t);
  if (loose) return `BMS ${loose[1]}+`;

  if (/\bf1\b/.test(t)) return "F1";
  if (/\bfull\s?blood(ed)?\b|\bfullblood\b/.test(t)) return "Fullblood";
  return undefined;
}

const ORIGIN_RULES: [Origin, RegExp][] = [
  ["japans", /japans|japanse|japan|kagoshima|miyazaki|kobe|hyogo|matsusaka|olive wagyu/],
  ["australisch", /australi|aussie|\bnsw\b|blackmore|stone axe|jacks creek|rangers valley|margaret river/],
  ["amerikaans", /amerikaans|american|\busa\b|snake river|texas/],
  ["iers", /\biers\b|ierse|ireland|irish/],
  ["nederlands", /nederlands|nederlandse|hollands|hollandse|\bdutch\b|limburg|brabant/],
  ["europees", /europees|europese|duits|duitse|spaans|spaanse|deens|deense|frans|franse/],
];

export function parseOrigin(text: string): Origin {
  const t = text.toLowerCase();
  for (const [origin, re] of ORIGIN_RULES) {
    if (re.test(t)) return origin;
  }
  return "onbekend";
}

/**
 * Deelstuk. Volgorde telt: specifieke termen eerst, anders vangt "rib" ook
 * "short rib" af. De labels zijn de weergavenamen in de UI.
 */
const CUT_RULES: [string, RegExp][] = [
  ["Tomahawk", /tomahawk/],
  ["Short rib", /short\s?rib|shortrib|beef rib/],
  ["Ribeye / entrecote", /rib\s?eye|ribeye|entrecote|entrecôte|cote de boeuf|côte de boeuf|rib roast/],
  ["Ossenhaas / tournedos", /ossenhaas|tournedos|tenderloin|filet\s?mignon|haasfilet/],
  ["Striploin / sirloin", /striploin|strip loin|sirloin|new york strip|contrafilet|contra\s?filet/],
  ["Picanha", /picanha|staartstuk|rump\s?cap/],
  ["Bavette / flank", /bavette|flank|vinnenlap|onglet|skirt/],
  ["Sukiyaki / shabu", /sukiyaki|shabu|hotpot|dungesneden|dun gesneden|yakiniku/],
  ["Burger", /burger|hamburger|patty/],
  ["Gehakt", /gehakt|minced|mince\b/],
  ["Worst / spek", /worst|salami|chorizo|spek|bacon|pastrami|bresaola/],
  ["Brisket", /brisket|borst/],
  ["Chuck / sukade", /chuck|sukade|schouder|klapstuk/],
  ["Carpaccio", /carpaccio|tataki/],
  ["Steak (overig)", /steak|biefstuk|lende|rump/],
  ["Pakket / box", /pakket|box|proefpakket|bbq[- ]?pakket|assortiment/],
];

export function parseCut(text: string): string | undefined {
  const t = text.toLowerCase();
  for (const [cut, re] of CUT_RULES) {
    if (re.test(t)) return cut;
  }
  return undefined;
}

/**
 * Segment waarbinnen kiloprijzen vergelijkbaar zijn. A5 ossenhaas hoort niet
 * in dezelfde mediaan als Iers wagyu gehakt.
 */
export function segmentKey(origin: Origin, grade: string | undefined, cut: string | undefined): string {
  const gradeBucket = !grade ? "geen" : grade.startsWith("A") ? grade : "bms";
  return `${origin}|${gradeBucket}|${cut ?? "overig"}`;
}
