import { NextResponse } from "next/server";
import { getDeals } from "@/lib/cache";
import { storageBackend } from "@/lib/store";
import { shops } from "@/lib/deals";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Diagnose-endpoint: welke shops leveren data en welke niet? */
export async function GET() {
  const result = await getDeals();
  return NextResponse.json({
    generatedAt: result.generatedAt,
    storage: storageBackend(),
    aiAgent: Boolean(process.env.ANTHROPIC_API_KEY),
    shopsConfigured: shops.length,
    health: result.health,
  });
}
