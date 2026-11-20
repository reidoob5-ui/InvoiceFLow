// Aritmética decimal exacta com BigInt. Nunca usamos floats para dinheiro.
// Valores de entrada (preços, quantidades, percentagens) vivem com escala 6.

export const SCALE = 6;
export const ONE = 10n ** 6n;

function numToString(x: unknown, field: string): string {
  if (typeof x === "bigint") return x.toString();
  if (typeof x === "number") {
    if (!Number.isFinite(x)) throw new RangeError(`${field}: número inválido`);
    let s = x.toString();
    if (/e/i.test(s)) s = x.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }
  return String(x).trim();
}

/** Converte número/string para BigInt com escala 6. Rejeita excesso de casas decimais. */
export function parseDecimal(
  x: unknown,
  field = "valor",
  { maxDecimals = 6, allowNegative = false }: { maxDecimals?: number; allowNegative?: boolean } = {},
): bigint {
  const s = numToString(x, field);
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new RangeError(`${field}: valor numérico inválido (${s})`);
  const neg = m[1];
  const int = m[2]!;
  const frac = (m[3] ?? "").replace(/0+$/, "");
  if (frac.length > maxDecimals) {
    throw new RangeError(`${field}: máximo de ${maxDecimals} casas decimais (${s})`);
  }
  const v = BigInt(int) * ONE + BigInt(frac.padEnd(SCALE, "0") || "0");
  if (neg && v !== 0n) {
    if (!allowNegative) throw new RangeError(`${field}: não pode ser negativo (${s})`);
    return -v;
  }
  return v;
}

export type RoundMode = "half-up" | "ceil" | "floor";

/** Divisão inteira com arredondamento. n >= 0, d > 0. */
export function divRound(n: bigint, d: bigint, mode: RoundMode = "half-up"): bigint {
  if (d <= 0n) throw new RangeError("divisor inválido");
  if (n < 0n) throw new RangeError("divRound só aceita n >= 0");
  if (mode === "ceil") return (n + d - 1n) / d;
  if (mode === "floor") return n / d;
  return (2n * n + d) / (2n * d);
}

function fixedString(v: bigint, scale: number): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(scale);
  const int = a / base;
  const frac = (a % base).toString().padStart(scale, "0");
  return `${neg ? "-" : ""}${int}.${frac}`;
}

/** Cêntimos (BigInt) -> number JSON (ex.: 2315n -> 23.15). */
export function centsToNumber(c: bigint): number {
  return Number(fixedString(c, 2));
}

/** Valor com escala N (BigInt) -> number JSON, sem ruído de vírgula flutuante. */
export function scaledToNumber(v: bigint, scale = SCALE): number {
  const s = fixedString(v, scale);
  return Number(s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);
}

export function centsToString(c: bigint): string {
  return fixedString(c, 2);
}
