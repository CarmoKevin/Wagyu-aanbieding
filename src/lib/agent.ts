import Anthropic from "@anthropic-ai/sdk";
import { envIsSet, envString } from "@/lib/env";
import type { Deal } from "@/lib/types";

/**
 * De AI-laag is optioneel: zonder ANTHROPIC_API_KEY draait de scanner gewoon
 * door, alleen zonder samenvatting en zonder shop-ontdekking.
 */
const model = () => envString("WAGYU_AGENT_MODEL", "claude-opus-5");

function client(): Anthropic | null {
  if (!envIsSet("ANTHROPIC_API_KEY")) return null;
  return new Anthropic();
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Korte Nederlandse duiding van de dagtop, voor bovenaan de pagina. */
export async function summarize(deals: Deal[]): Promise<string | undefined> {
  const anthropic = client();
  if (!anthropic || deals.length === 0) return undefined;

  const table = deals
    .map(
      (d) =>
        `- ${d.title}${d.variantTitle ? ` (${d.variantTitle})` : ""} | ${d.shopName} | € ${d.price.toFixed(2)}` +
        `${d.pricePerKg ? ` | € ${Math.round(d.pricePerKg)}/kg` : " | kiloprijs onbekend"}` +
        `${d.discountPct ? ` | ${Math.round(d.discountPct)}% korting` : ""}` +
        `${d.grade ? ` | ${d.grade}` : ""} | herkomst: ${d.origin} | score ${d.score}`,
    )
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: model(),
      max_tokens: 1200,
      output_config: { effort: "low" },
      system:
        "Je bent een nuchtere Nederlandse vleesinkoper. Je beoordeelt wagyu-aanbiedingen op prijs per kilo " +
        "en op echte korting. Je waarschuwt als een korting vooral van een opgeblazen adviesprijs komt of als " +
        "een kiloprijs juist hoog is. Schrijf in het Nederlands, maximaal 120 woorden, geen opsomming langer dan 3 punten.",
      messages: [
        {
          role: "user",
          content: `Dit zijn de best scorende wagyu-aanbiedingen van vandaag:\n\n${table}\n\nGeef in maximaal 120 woorden welke er echt de moeite waard zijn en waarom.`,
        },
      ],
    });
    return textOf(response.content) || undefined;
  } catch {
    // De samenvatting is een extraatje; een API-fout mag de scan niet blokkeren.
    return undefined;
  }
}

export type ShopSuggestion = { name: string; url: string; reden: string };

/**
 * Zoekt met de web-search tool naar Nederlandse wagyu-webshops die nog niet in
 * config/shops.json staan. Bedoeld om handmatig te reviewen, niet om
 * automatisch toe te voegen.
 */
export async function discoverShops(knownDomains: string[]): Promise<ShopSuggestion[]> {
  const anthropic = client();
  if (!anthropic) return [];

  try {
    const response = await anthropic.messages.create({
      model: model(),
      max_tokens: 4000,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 6,
          user_location: { type: "approximate", country: "NL" },
        },
      ],
      messages: [
        {
          role: "user",
          content:
            "Zoek Nederlandse webshops die wagyu-rundvlees online verkopen en naar Nederland leveren. " +
            `Sla deze domeinen over, die ken ik al: ${knownDomains.join(", ")}. ` +
            "Antwoord met uitsluitend een JSON-array in een ```json codeblok, met per shop " +
            '{"name": "...", "url": "https://...", "reden": "korte reden"}. Maximaal 8 shops.',
        },
      ],
    });

    return parseSuggestions(textOf(response.content));
  } catch {
    return [];
  }
}

/** Haalt de JSON-array uit het antwoord; tolerant voor tekst eromheen. */
export function parseSuggestions(text: string): ShopSuggestion[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ShopSuggestion => {
        const o = item as Record<string, unknown>;
        return typeof o?.name === "string" && typeof o?.url === "string";
      })
      .map((item) => ({ name: item.name, url: item.url, reden: item.reden ?? "" }));
  } catch {
    return [];
  }
}
