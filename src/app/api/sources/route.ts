import { NextResponse } from "next/server";
import { getDeals } from "@/lib/cache";
import { envIsSet, envNumber } from "@/lib/env";
import { timeoutMs, userAgent } from "@/lib/http";
import { storageBackend } from "@/lib/store";
import { shops } from "@/lib/deals";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Diagnose-endpoint: welke shops leveren data, en met welke instellingen is er
 * gescand? Die instellingen staan er expliciet bij, want een verkeerd gezette
 * environment variable is anders niet te onderscheiden van een shop die plat ligt.
 */
export async function GET() {
  const result = await getDeals();

  return NextResponse.json({
    generatedAt: result.generatedAt,
    config: {
      timeoutMs: timeoutMs(),
      ttlMinutes: envNumber("DEALS_TTL_MINUTES", 180, { min: 5, max: 1440 }),
      userAgent: userAgent(),
      storage: storageBackend(),
      aiAgent: envIsSet("ANTHROPIC_API_KEY"),
    },
    shopsConfigured: shops.length,
    health: result.health,
  });
}
