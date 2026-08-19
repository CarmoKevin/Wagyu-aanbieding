import { NextResponse } from "next/server";
import { discoverShops } from "@/lib/agent";
import { shops } from "@/lib/deals";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Laat de agent met websearch nieuwe Nederlandse wagyu-shops voorstellen.
 * Bewust read-only: de suggesties zet je zelf in config/shops.json.
 */
export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY ontbreekt" }, { status: 503 });
  }

  const known = shops.map((s) => new URL(s.url).hostname);
  const suggestions = await discoverShops(known);
  return NextResponse.json({ known, suggestions });
}
