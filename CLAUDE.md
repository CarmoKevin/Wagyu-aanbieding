@AGENTS.md

# Wagyu-aanbieding

Next.js 16 (App Router) + TypeScript. Scant dagelijks Nederlandse wagyu-webshops
en rangschikt de aanbiedingen op een score die **korting** en **prijs per kilo**
tegen elkaar afweegt. Draait op Vercel; alle scanlogica leeft in `src/lib/`.

Documentatie, code-commentaar, UI-teksten, commit messages en de `reasons` in de
data zijn **Nederlands**. Houd dat zo. Identifiers en types zijn Engels
(`pricePerKg`, `discountBasis`), domeinbegrippen in de UI Nederlands
(`herkomst`, `korting`, `kiloprijs`).

## Commando's

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest run — 41 tests, snel, geen netwerk
npm run typecheck    # tsc --noEmit
npm run scan         # scan vanaf de cli: per shop wat binnenkomt + top 20
npm run scan -- --summary   # inclusief AI-samenvatting (vereist ANTHROPIC_API_KEY)
npm run build
```

**`npm run lint` werkt niet.** Het script roept `next lint` aan, dat in Next 16
verwijderd is; de CLI leest `lint` als directory-argument en faalt. Er is ook
geen eslint-config in de repo. Gebruik `npm test` + `npm run typecheck` als
poort vóór een commit, en repareer het lint-script niet ongevraagd.

Er is geen CI-workflow. Draai tests en typecheck dus altijd zelf.

## Architectuur

```
config/shops.json ─▶ adapters ─▶ normalize ─▶ score ─▶ cache ─▶ page + API
                    (3 soorten)  gewicht→€/kg  korting+waarde   in-memory
                                                   ▲
                                            store.ts (prijshistorie)
```

`scanAll()` in `src/lib/deals.ts` is het hart: shops parallel ophalen, filteren
op wagyu, normaliseren, scoren, prijshistorie wegschrijven, optioneel een
AI-samenvatting. Alles eromheen (routes, cli-script, pagina) roept dat aan.

### Bestanden

| Pad | Rol |
|---|---|
| `config/shops.json` | de te scannen shops; enige plek waar bronnen staan |
| `src/lib/types.ts` | `ShopConfig`, `RawProduct`, `Deal`, `SourceHealth`, `ScanResult` — begin hier |
| `src/lib/adapters/index.ts` | kiest de adapter (`auto` = shopify → woocommerce → jsonld) |
| `src/lib/adapters/shopify.ts` | `/products.json`; levert van-prijs én `grams` per variant |
| `src/lib/adapters/woocommerce.ts` | Store API; prijzen zijn integers, deel door `currency_minor_unit` |
| `src/lib/adapters/jsonld.ts` | schema.org uit de HTML; fallback voor alle overige shopsystemen |
| `src/lib/parse/weight.ts` | gewicht uit vrije tekst → gram → kiloprijs |
| `src/lib/parse/classify.ts` | wagyu-check, grade, herkomst, deelstuk, `segmentKey` |
| `src/lib/normalize.ts` | `RawProduct` → `Deal` (id, gewicht, kiloprijs, shop-korting) |
| `src/lib/score.ts` | benchmarks (medianen) + `scoreDeal` |
| `src/lib/deals.ts` | `scanAll`, per-shop health, historie-korting |
| `src/lib/store.ts` | prijshistorie: KV → lokaal bestand → geheugen |
| `src/lib/cache.ts` | in-memory cache per serverless-instantie, deelt lopende scans |
| `src/lib/http.ts` | fetch met timeout, eigen user-agent, `mapLimit` |
| `src/lib/robots.ts` | minimale robots.txt-check, verplicht vóór elke externe fetch |
| `src/lib/agent.ts` | optionele Claude-laag: samenvatting + shops ontdekken |

### Routes

| Route | Doet |
|---|---|
| `/` | server component, rendert de top 40 met filters |
| `/api/deals` | dezelfde data als JSON (`minKorting`, `maxPerKilo`, `herkomst`, `limit`, `refresh=1`) |
| `/api/sources` | diagnose: per shop bereikbaar/adapter/aantallen — begin hier bij "geen deals" |
| `/api/detect?url=` | test of een nieuwe shop uit te lezen is |
| `/api/agent` | Claude met websearch stelt nieuwe shops voor (alleen met API-key, read-only) |
| `/api/cron/refresh` | dagelijkse Vercel-cron, 06:00 UTC (`vercel.json`), beschermd met `CRON_SECRET` |

Elke route zet `dynamic = "force-dynamic"` en een ruime `maxDuration` — externe
shops bevragen duurt lang. Neem dat over in nieuwe routes die scannen.

## Hoe de score werkt

`WEIGHTS = { discount: 0.45, value: 0.55 }` in `src/lib/score.ts`.

- **Korting (45%)**: uit `compareAtPrice` van de shop (`discountBasis: "shop"`),
  anders uit de mediaan van de eigen prijshistorie (`"history"`, ≥3 metingen,
  ≥3%). 40% korting is maximaal.
- **Waarde (55%)**: hoeveel de kiloprijs onder de mediaan van *vergelijkbaar*
  vlees ligt. Vergelijken gaat via `segmentKey(origin, grade, cut)` met fallback
  naar grade+cut en dan cut. **Nooit over deelstukken heen vergelijken** —
  gehakt tegen de mediaan van alle wagyu afzetten kroont gehakt elke dag tot
  koopje. Een segment telt pas mee vanaf 3 producten (`MIN_SEGMENT_SIZE`).
- Straffactoren: geen kiloprijs ×0.6, uitverkocht ×0.25, pakket/box ×0.85.

Deze weging is een expliciete productkeuze, geen toeval. Verander gewichten,
drempels of de segmentatie alleen op verzoek, en pas dan ook `tests/score.test.ts`
en de uitleg in `README.md` aan.

## Conventies

- **Path alias** `@/*` → `./src/*` (tsconfig én `vitest.config.ts`).
  `config/shops.json` importeer je als `@/../config/shops.json`.
- **Falen doet één ding stuk, niet alles.** Adapters, robots-checks, historie en
  de AI-laag vangen hun fouten af en geven leeg terug; een kapotte shop of
  ontbrekende API-key mag de scan nooit laten crashen. Houd die stijl aan.
- **Netjes scrapen** is een harde eis: elke externe fetch gaat via `src/lib/http.ts`
  (timeout + eigen user-agent) en langs `isAllowed()` uit `src/lib/robots.ts`.
  Verhoog paginalimieten of scanfrequentie niet zonder reden.
- **`Deal.reasons`** is de onderbouwing die de gebruiker leest. Voeg je een
  score-component toe, voeg dan ook een Nederlandse regel toe.
- **`dealId()`** is de sleutel van de prijshistorie. Verander die formule niet:
  dan is alle bestaande historie los zand.
- Alleen `Deal`-objecten worden gecached; er is geen database. De in-memory cache
  overleeft een cold start niet — dat is bewust, de cron vult hem weer.
- `AGENTS.md` wordt geschreven door `next dev`. Laat het bestand met rust en
  commit de wijziging mee als het opduikt in je diff. Lees vóór Next-specifiek
  werk `node_modules/next/dist/docs/` — dit is Next 16, niet wat je uit je
  training kent.

## Tests

Vitest, node-omgeving, `tests/**/*.test.ts`, geen netwerk (adapters worden getest
op geparste HTML/JSON-fixtures in de testfiles zelf). Testnamen zijn Nederlands.

Raak je `parse/weight.ts`, `parse/classify.ts`, `score.ts`, `store.ts` of de
adapters aan, breid dan de bijbehorende testfile uit — dat zijn de plekken waar
regressies stil binnenkomen.

## Een shop toevoegen

1. `curl "http://localhost:3000/api/detect?url=https://nieuweshop.nl"`.
2. Werkt het → regel in `config/shops.json` met `"adapter": "auto"`.
3. Werkt het niet → `"adapter": "jsonld"` plus `listingPaths` met de
   wagyu-categoriepagina('s).
4. `"enabled": false` slaat een shop tijdelijk over.

De shops in `config/shops.json` zijn nog niet live geverifieerd (de
ontwikkelomgeving heeft geen toegang tot externe sites). `/api/sources` na een
deploy is de waarheid.

## Environment

Alles is optioneel; zonder env vars draait de scanner gewoon, alleen zonder
AI-duiding en zonder historie over cold starts heen. Zie `.env.example`:
`ANTHROPIC_API_KEY`, `WAGYU_AGENT_MODEL` (standaard `claude-opus-5`),
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (of de `UPSTASH_REDIS_REST_*`-varianten),
`CRON_SECRET`, `DEALS_TTL_MINUTES` (180), `FETCH_TIMEOUT_MS` (12000),
`SCRAPER_USER_AGENT`, `IGNORE_ROBOTS` (alleen lokaal debuggen).
