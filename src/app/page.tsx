import { getDeals } from "@/lib/cache";
import { DealCard } from "@/components/DealCard";
import { Filters } from "@/components/Filters";

// De pagina rendert per request; het cachen doet lib/cache.ts zelf.
export const maxDuration = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const minKorting = first(params.minKorting);
  const maxPerKilo = first(params.maxPerKilo);
  const herkomst = first(params.herkomst);

  const result = await getDeals();

  const deals = result.deals
    .filter((d) => (d.discountPct ?? 0) >= (Number(minKorting) || 0))
    .filter((d) => (d.pricePerKg ?? Infinity) <= (Number(maxPerKilo) || Infinity))
    .filter((d) => !herkomst || d.origin === herkomst)
    .slice(0, 40);

  const werkendeShops = result.health.filter((h) => h.ok);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Wagyu-aanbieding</h1>
        <p className="mt-2 text-neutral-600">
          Dagelijkse scan van Nederlandse wagyu-webshops. Gesorteerd op een score die korting én
          prijs per kilo meeweegt — een dikke korting op een opgeblazen adviesprijs komt dus niet
          vanzelf bovenaan.
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Laatste scan:{" "}
          {new Date(result.generatedAt).toLocaleString("nl-NL", { dateStyle: "full", timeStyle: "short" })}
          {" · "}
          {werkendeShops.length}/{result.health.length} shops bereikbaar
          {" · "}
          {result.deals.length} producten gevonden
        </p>
      </header>

      {result.summary ? (
        <section className="mt-6 rounded-xl border border-fat bg-marbling p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Oordeel van de agent
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm">{result.summary}</p>
        </section>
      ) : null}

      <div className="mt-6">
        <Filters minKorting={minKorting} maxPerKilo={maxPerKilo} herkomst={herkomst} />
      </div>

      <section className="mt-6 space-y-3">
        {deals.length === 0 ? (
          <p className="rounded-xl border border-fat bg-white p-6 text-neutral-600">
            Geen aanbiedingen gevonden met deze filters. Check{" "}
            <a className="text-beef underline" href="/api/sources">
              /api/sources
            </a>{" "}
            om te zien of de shops bereikbaar zijn.
          </p>
        ) : (
          deals.map((deal, index) => <DealCard key={deal.id} deal={deal} rank={index + 1} />)
        )}
      </section>

      <footer className="mt-10 border-t border-fat pt-4 text-xs text-neutral-500">
        Prijzen zijn een momentopname en kunnen bij de shop afwijken; verzendkosten zitten er niet
        in. Controleer altijd de webshop zelf voordat je bestelt.
      </footer>
    </main>
  );
}
