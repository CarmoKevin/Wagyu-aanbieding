# Wagyu-aanbieding

Een agent die dagelijks Nederlandse wagyu-webshops afgaat en de beste deals van
de dag op een rij zet — gerangschikt op **korting** én op **prijs per kilo**.

Die twee worden bewust tegen elkaar afgewogen. "60% korting" op een opgeblazen
adviesprijs komt niet vanzelf bovenaan: zonder goede kiloprijs blijft ruim de
helft van de score liggen.

## Hoe het werkt

```
config/shops.json ─▶ adapters ─▶ normaliseren ─▶ scoren ─▶ site + API
                    (3 soorten)  gewicht → €/kg   korting + kiloprijs
```

1. **Uitlezen.** Per shop wordt automatisch de best werkende methode gekozen:
   - `shopify` — `/products.json`, inclusief van-prijs (`compare_at_price`) en gewicht per variant;
   - `woocommerce` — de publieke Store API (`/wp-json/wc/store/v1/products`);
   - `jsonld` — de schema.org-data die vrijwel elke webshop voor Google in de pagina zet.

   `robots.txt` wordt gerespecteerd, requests hebben een timeout en een eigen
   user-agent, en er wordt hooguit een paar keer per dag gescand.

2. **Normaliseren.** Uit titel en variant komt het gewicht (`250 gram`,
   `1,2 kg`, `4 x 150 g`, `300-350 gram`, `per 100 gram`) en daarmee de
   kiloprijs. Ook grade (A5, BMS 8-9), herkomst en deelstuk worden herkend.

3. **Scoren.** `src/lib/score.ts` combineert:
   - **korting** (45%) — uit de van-prijs van de shop, of anders uit de eigen
     prijshistorie, zodat een stille prijsverlaging ook meetelt;
   - **kiloprijs** (55%) — hoeveel onder de mediaan van *vergelijkbaar* vlees.
     Er wordt alleen binnen hetzelfde deelstuk vergeleken: gehakt afzetten tegen
     de mediaan van alle wagyu zou gehakt elke dag tot koopje kronen.

   Uitverkocht en "gewicht onbekend" drukken de score.

## Deployen op Vercel

```bash
npm install
npm run dev        # lokaal op http://localhost:3000
```

1. Push deze repo naar GitHub en importeer hem op [vercel.com/new](https://vercel.com/new) — Next.js wordt herkend, verder niets in te stellen.
2. `vercel.json` zet een **cron** klaar die elke dag om 06:00 UTC `/api/cron/refresh` aanroept, zodat de eerste bezoeker niet op de scan hoeft te wachten.
3. Optionele environment variables (zie `.env.example`):

   | Variabele | Waarvoor |
   |---|---|
   | `ANTHROPIC_API_KEY` | zet de AI-agent aan: dagelijkse duiding bovenaan de pagina en `/api/agent` om nieuwe shops te vinden |
   | `KV_REST_API_URL` / `KV_REST_API_TOKEN` | prijshistorie bewaren (Vercel KV of Upstash Redis); nodig voor korting bij shops zonder van-prijs |
   | `CRON_SECRET` | beschermt `/api/cron/refresh`; Vercel stuurt hem automatisch mee |
   | `DEALS_TTL_MINUTES` | hoe lang een scan hergebruikt wordt (standaard 180) |

   Zonder KV werkt alles gewoon, alleen is de prijshistorie weg na een cold start.

   > Variabelen die je niet gebruikt, laat je wég in plaats van leeg. Een lege
   > waarde wordt als "niet gezet" behandeld en valt terug op de standaard, dus
   > leeg invullen kan geen kwaad — maar weglaten is duidelijker.

4. Check daarna `/api/sources`. Die laat naast de status per shop ook de
   instellingen zien waarmee gescand is (`timeoutMs`, `ttlMinutes`, `userAgent`,
   `storage`), zodat een verkeerd gezette variabele meteen opvalt.

## Endpoints

| Route | Wat het doet |
|---|---|
| `/` | de deals van vandaag, met filters op korting, kiloprijs en herkomst |
| `/api/deals?minKorting=20&maxPerKilo=150&herkomst=japans&limit=25` | dezelfde data als JSON |
| `/api/sources` | per shop: bereikbaar of niet, welke adapter, hoeveel producten — begin hier bij problemen |
| `/api/detect?url=https://voorbeeld.nl` | test of een nieuwe shop uit te lezen is |
| `/api/agent` | laat Claude met websearch nieuwe NL wagyu-shops voorstellen (alleen met API-key) |
| `/api/cron/refresh` | wat de dagelijkse cron aanroept |

## Een shop toevoegen

```bash
curl "https://<jouw-app>.vercel.app/api/detect?url=https://nieuweshop.nl"
```

Werkt dat, zet hem dan in `config/shops.json`:

```json
{ "id": "nieuweshop", "name": "Nieuwe Shop", "url": "https://nieuweshop.nl", "adapter": "auto" }
```

Levert `detect` niets op, dan heeft de shop geen product-API. Geef dan
`listingPaths` mee met de wagyu-categoriepagina('s); de JSON-LD-adapter leest
die pagina's uit:

```json
{ "id": "nieuweshop", "name": "Nieuwe Shop", "url": "https://nieuweshop.nl",
  "adapter": "jsonld", "listingPaths": ["/wagyu", "/rundvlees/wagyu"] }
```

Met `"enabled": false` sla je een shop tijdelijk over.

> De shops in `config/shops.json` zijn nog **niet live geverifieerd**: de
> ontwikkelomgeving waarin dit gebouwd is heeft geen internettoegang naar
> externe sites. Na de eerste deploy laat `/api/sources` per shop zien of het
> werkt; shops die niets opleveren pas je aan met `listingPaths` of vervang je.

## Ontwikkelen

```bash
npm test         # gewichten, grades, scoring, JSON-LD, robots.txt, prijshistorie
npm run typecheck
npm run scan     # scan vanaf de commandline: per shop wat er binnenkomt + top 20
npm run scan -- --summary   # inclusief AI-samenvatting
```

## Kanttekeningen

- Prijzen zijn een momentopname, en **verzendkosten zitten er niet in** — die
  wegen bij gekoeld vlees zwaar mee.
- Gewicht komt uit de producttitel. Staat er geen gewicht in, dan is er geen
  kiloprijs en zakt het product in de ranking; dat is expres.
- Dit leest alleen publiek toegankelijke pagina's, respecteert `robots.txt` en
  scant hooguit een paar keer per dag. Ga je intensiever scannen, check dan de
  voorwaarden van de betreffende webshop.
