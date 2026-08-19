import type { Deal } from "@/lib/types";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function DealCard({ deal, rank }: { deal: Deal; rank: number }) {
  return (
    <article className="flex gap-4 rounded-xl border border-fat bg-white p-4 shadow-sm">
      <div className="flex w-10 shrink-0 flex-col items-center">
        <span className="text-xs text-neutral-400">#{rank}</span>
        <span className="mt-1 rounded-full bg-beef px-2 py-1 text-xs font-semibold text-white">
          {Math.round(deal.score)}
        </span>
      </div>

      {deal.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- externe shop-URLs, geen optimalisatie nodig
        <img
          src={deal.image}
          alt=""
          loading="lazy"
          className="hidden h-24 w-24 shrink-0 rounded-lg object-cover sm:block"
        />
      ) : null}

      <div className="min-w-0 flex-1">
        <a
          href={deal.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-semibold text-ink hover:text-beef"
        >
          {deal.title}
          {deal.variantTitle ? <span className="text-neutral-500"> — {deal.variantTitle}</span> : null}
        </a>

        <p className="mt-1 text-sm text-neutral-500">
          {deal.shopName}
          {deal.grade ? ` · ${deal.grade}` : ""}
          {deal.origin !== "onbekend" ? ` · ${deal.origin}` : ""}
          {deal.cut ? ` · ${deal.cut}` : ""}
        </p>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-lg font-bold">{euro.format(deal.price)}</span>
          {deal.compareAtPrice ? (
            <span className="text-sm text-neutral-400 line-through">
              {euro.format(deal.compareAtPrice)}
            </span>
          ) : null}
          {deal.discountPct ? (
            <span className="rounded bg-beef/10 px-2 py-0.5 text-sm font-semibold text-beef">
              -{Math.round(deal.discountPct)}%
            </span>
          ) : null}
          {deal.pricePerKg ? (
            <span className="text-sm font-medium text-neutral-700">
              {euro.format(deal.pricePerKg)} / kg
            </span>
          ) : (
            <span className="text-sm text-neutral-400">kiloprijs onbekend</span>
          )}
        </div>

        <p className="mt-2 text-xs text-neutral-500">{deal.reasons.join(" · ")}</p>
      </div>
    </article>
  );
}
