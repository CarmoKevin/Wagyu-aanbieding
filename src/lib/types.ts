/** Bronconfiguratie van een webshop (zie config/shops.json). */
export type ShopConfig = {
  id: string;
  name: string;
  /** Basis-URL inclusief protocol, zonder trailing slash. */
  url: string;
  /** "auto" probeert Shopify -> WooCommerce -> JSON-LD achter elkaar. */
  adapter: "auto" | "shopify" | "woocommerce" | "jsonld";
  /** Pagina's met wagyu-producten, relatief of absoluut. Gebruikt door de jsonld-adapter. */
  listingPaths?: string[];
  /** Zet op false om een shop tijdelijk over te slaan zonder hem te verwijderen. */
  enabled?: boolean;
  /** Verzendkosten indicatie (EUR), puur informatief in de UI. */
  shippingNote?: string;
  /** Vrije notitie, bijvoorbeeld waarom een shop uit staat. */
  note?: string;
};

/** Ruw product zoals een adapter het uit een webshop haalt, nog niet verrijkt. */
export type RawProduct = {
  shopId: string;
  shopName: string;
  url: string;
  title: string;
  variantTitle?: string;
  image?: string;
  /** Actuele prijs in euro. */
  price: number;
  /** Van-prijs / adviesprijs in euro, als de shop die publiceert. */
  compareAtPrice?: number;
  available: boolean;
  /** Gewicht in gram als de shop het als veld levert (Shopify `grams`). */
  weightGramsHint?: number;
  productType?: string;
  tags?: string[];
  description?: string;
  /** Welke adapter dit product leverde; handig bij debuggen. */
  via: "shopify" | "woocommerce" | "jsonld";
};

export type Origin =
  | "japans"
  | "australisch"
  | "amerikaans"
  | "iers"
  | "nederlands"
  | "europees"
  | "onbekend";

/** Verrijkt product met kiloprijs, korting en dealscore. */
export type Deal = RawProduct & {
  id: string;
  weightGrams?: number;
  /** Hoe het gewicht is bepaald: uit de titel, uit een shopveld, of geschat. */
  weightSource?: "title" | "variant" | "field" | "unit-price";
  pricePerKg?: number;
  /** Korting in procenten t.o.v. compareAtPrice of de eigen prijshistorie. */
  discountPct?: number;
  discountBasis?: "shop" | "history";
  grade?: string;
  origin: Origin;
  cut?: string;
  /** 0-100. Hoger = betere deal. */
  score: number;
  /** Onderbouwing in het Nederlands, wordt in de UI getoond. */
  reasons: string[];
  seenAt: string;
};

export type SourceHealth = {
  shopId: string;
  shopName: string;
  ok: boolean;
  via?: RawProduct["via"];
  products: number;
  wagyuProducts: number;
  ms: number;
  error?: string;
};

export type ScanResult = {
  generatedAt: string;
  deals: Deal[];
  health: SourceHealth[];
  /** Optionele samenvatting van de AI-agent (alleen met ANTHROPIC_API_KEY). */
  summary?: string;
};
