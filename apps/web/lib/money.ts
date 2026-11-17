import Decimal from "decimal.js";

// Decimal-safe money maths. Never use JS floats for amounts.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type Numeric = Decimal | string | number | { toString(): string };

export const D = (v: Numeric | null | undefined): Decimal => new Decimal(v == null ? 0 : v.toString());

/** Round to 2 decimal places, half-up (standard commercial rounding). */
export const round2 = (v: Numeric): Decimal => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Format an amount for display with the locale's currency conventions. */
export function formatMoney(value: Numeric | null | undefined, currency: string, locale = "pt"): string {
  const n = D(value).toNumber();
  try {
    return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function localeTag(locale: string): string {
  return ({ pt: "pt-PT", en: "en-US", fr: "fr-FR", es: "es-ES" } as Record<string, string>)[locale] ?? locale;
}

export function formatDate(value: Date | string | null | undefined, locale = "pt", timeZone?: string): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeZone }).format(d);
}
