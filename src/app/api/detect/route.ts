import { NextResponse } from "next/server";
import { detectAdapter } from "@/lib/adapters";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Test of een willekeurige webshop uit te lezen is, zodat je hem met
 * vertrouwen aan config/shops.json kunt toevoegen:
 *   /api/detect?url=https://voorbeeld.nl
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "geef ?url=https://..." }, { status: 400 });

  let normalized: string;
  try {
    normalized = new URL(url).origin;
  } catch {
    return NextResponse.json({ error: "ongeldige url" }, { status: 400 });
  }

  const result = await detectAdapter(normalized);
  return result
    ? NextResponse.json({ url: normalized, ...result, supported: true })
    : NextResponse.json({
        url: normalized,
        supported: false,
        hint: "Geen Shopify/WooCommerce/JSON-LD gevonden. Voeg listingPaths toe met de wagyu-categoriepagina.",
      });
}
