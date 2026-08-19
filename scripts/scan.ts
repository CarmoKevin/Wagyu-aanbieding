/**
 * Handmatige scan vanaf de commandline: `npm run scan`.
 * Handig om te zien welke shops data leveren zonder de site te deployen.
 */
import { scanAll } from "../src/lib/deals";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

async function main() {
  const result = await scanAll({ withSummary: process.argv.includes("--summary") });

  console.log("\nBronnen:");
  for (const h of result.health) {
    const status = h.ok ? "ok " : "FOUT";
    console.log(
      `  ${status} ${h.shopName.padEnd(18)} ${String(h.wagyuProducts).padStart(3)} wagyu / ${String(h.products).padStart(4)} producten` +
        ` (${h.via ?? "-"}, ${h.ms} ms)${h.error ? ` — ${h.error}` : ""}`,
    );
  }

  console.log(`\nTop ${Math.min(20, result.deals.length)} deals:`);
  for (const [i, d] of result.deals.slice(0, 20).entries()) {
    console.log(
      `  ${String(i + 1).padStart(2)}. [${String(Math.round(d.score)).padStart(3)}] ${d.title.slice(0, 60).padEnd(60)}` +
        ` ${euro.format(d.price).padStart(10)}` +
        ` ${(d.pricePerKg ? `${euro.format(d.pricePerKg)}/kg` : "?/kg").padStart(12)}` +
        ` ${(d.discountPct ? `-${Math.round(d.discountPct)}%` : "").padStart(5)}  ${d.shopName}`,
    );
  }

  if (result.summary) console.log(`\nAgent:\n${result.summary}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
