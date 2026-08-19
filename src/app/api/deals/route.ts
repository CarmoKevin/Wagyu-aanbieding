import { NextResponse } from "next/server";
import { getDeals } from "@/lib/cache";

// Elke shop wordt live bevraagd; dat mag even duren.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await getDeals({ force: params.get("refresh") === "1" });

  const minDiscount = Number(params.get("minKorting") ?? 0);
  const maxPerKg = Number(params.get("maxPerKilo") ?? Infinity);
  const origin = params.get("herkomst");
  const limit = Number(params.get("limit") ?? 60);

  const deals = result.deals
    .filter((d) => (d.discountPct ?? 0) >= minDiscount)
    .filter((d) => (d.pricePerKg ?? Infinity) <= maxPerKg)
    .filter((d) => !origin || d.origin === origin)
    .slice(0, Number.isFinite(limit) ? limit : 60);

  return NextResponse.json({ generatedAt: result.generatedAt, count: deals.length, deals });
}
