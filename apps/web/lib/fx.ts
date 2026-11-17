import { D, Decimal, round2, type Numeric } from "./money";

export type RateRow = { base: string; quote: string; rate: Numeric; date: Date };

/**
 * Find the rate to convert 1 `from` into `to` using the most recent stored rows.
 * Tries direct, inverse and triangulation through `pivot` (usually the organization's base currency).
 * Returns null when no path exists — callers must surface that instead of guessing.
 */
export function findRate(rows: RateRow[], from: string, to: string, pivot?: string, asOf = new Date()): Decimal | null {
  if (from === to) return D(1);
  const latest = (b: string, q: string): Decimal | null => {
    const hit = rows
      .filter((r) => r.base === b && r.quote === q && r.date.getTime() <= asOf.getTime())
      .sort((a, c) => c.date.getTime() - a.date.getTime())[0];
    return hit ? D(hit.rate) : null;
  };
  const direct = latest(from, to);
  if (direct && direct.gt(0)) return direct;
  const inverse = latest(to, from);
  if (inverse && inverse.gt(0)) return D(1).div(inverse);
  if (pivot && pivot !== from && pivot !== to) {
    const a = findRate(rows, from, pivot, undefined, asOf);
    const b = findRate(rows, pivot, to, undefined, asOf);
    if (a && b) return a.mul(b);
  }
  return null;
}

export function convert(amount: Numeric, rate: Numeric): Decimal {
  return round2(D(amount).mul(D(rate)));
}

export const SUPPORTED_CURRENCIES = [
  "AOA", "USD", "EUR", "GBP", "BRL", "MZN", "CVE", "ZAR", "CHF", "CAD", "AUD", "JPY", "CNY", "XOF", "XAF",
] as const;
