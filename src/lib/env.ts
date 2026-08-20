/**
 * Environment variables lezen zonder voetangels.
 *
 * `process.env.X ?? fallback` gaat mis zodra een variabele wél bestaat maar
 * leeg is — precies wat er gebeurt als je .env.example in Vercel plakt of een
 * variabele zonder waarde aanmaakt. `Number("")` is 0, en een timeout van 0 ms
 * breekt elke request meteen af. Daarom: lege of onleesbare waarden gelden hier
 * als "niet gezet", en getallen worden binnen een veilige marge gehouden.
 */

/** Ruwe waarde, of undefined als de variabele ontbreekt of leeg is. */
export function envRaw(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function envString(name: string, fallback: string): string {
  return envRaw(name) ?? fallback;
}

/** Is deze variabele echt ingevuld? (Lege string telt niet mee.) */
export function envIsSet(name: string): boolean {
  return envRaw(name) !== undefined;
}

/**
 * Getal met ondergrens en bovengrens. Onzin ("", "abc", "-5") valt terug op de
 * standaardwaarde in plaats van stilletjes 0 of NaN te worden.
 */
export function envNumber(
  name: string,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const raw = envRaw(name);
  if (raw === undefined) return clampTo(fallback, min, max);

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return clampTo(fallback, min, max);
  return clampTo(parsed, min, max);
}

function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
