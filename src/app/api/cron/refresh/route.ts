import { NextResponse } from "next/server";
import { envRaw } from "@/lib/env";
import { refreshDeals } from "@/lib/cache";

// Vercel Cron roept dit dagelijks aan (zie vercel.json).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel stuurt CRON_SECRET mee als Authorization-header; buiten Vercel is
  // het endpoint open zolang je geen secret zet.
  const secret = envRaw("CRON_SECRET");
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await refreshDeals({ withSummary: true });
  return NextResponse.json({
    ok: true,
    generatedAt: result.generatedAt,
    deals: result.deals.length,
    shopsOk: result.health.filter((h) => h.ok).length,
    shopsFailed: result.health.filter((h) => !h.ok).map((h) => h.shopId),
  });
}
