import { D, round2, Decimal, type Numeric } from "./money";

export type LineInput = {
  quantity: Numeric;
  unitPrice: Numeric;
  /** 0–100 */
  discountPercent?: Numeric;
  /** 0–100 */
  taxRate?: Numeric;
};

export type LineResult = {
  gross: Decimal;
  discount: Decimal;
  /** Net amount of the line (after discount, before tax). Stored as `lineTotal`. */
  net: Decimal;
  tax: Decimal;
};

export type DocumentTotals = {
  lines: LineResult[];
  /** Sum of line nets. */
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  withholdingTotal: Decimal;
  /** subtotal + tax − withholding */
  total: Decimal;
};

export class CalcError extends Error {}

function pct(v: Numeric | undefined, label: string): Decimal {
  const d = D(v);
  if (d.isNegative() || d.gt(100)) throw new CalcError(`${label} must be between 0 and 100`);
  return d;
}

/**
 * Compute totals for an invoice, credit note or quote.
 * Each line's discount, net and tax are rounded to 2 dp half-up so that the printed
 * lines always add up exactly to the document totals.
 */
export function computeTotals(lines: LineInput[], opts: { withholdingRate?: Numeric } = {}): DocumentTotals {
  const results: LineResult[] = lines.map((l, i) => {
    const qty = D(l.quantity);
    const price = D(l.unitPrice);
    if (qty.isNegative()) throw new CalcError(`Line ${i + 1}: quantity cannot be negative`);
    if (price.isNegative()) throw new CalcError(`Line ${i + 1}: unit price cannot be negative`);
    const discountPct = pct(l.discountPercent, `Line ${i + 1}: discount`);
    const taxPct = pct(l.taxRate, `Line ${i + 1}: tax rate`);

    const gross = round2(qty.mul(price));
    const discount = round2(gross.mul(discountPct).div(100));
    const net = gross.sub(discount);
    const tax = round2(net.mul(taxPct).div(100));
    return { gross, discount, net, tax };
  });

  const sum = (pick: (r: LineResult) => Decimal) => results.reduce((a, r) => a.add(pick(r)), D(0));
  const subtotal = sum((r) => r.net);
  const discountTotal = sum((r) => r.discount);
  const taxTotal = sum((r) => r.tax);
  const withholdingTotal = round2(subtotal.mul(pct(opts.withholdingRate, "Withholding rate")).div(100));
  const total = subtotal.add(taxTotal).sub(withholdingTotal);

  return { lines: results, subtotal, discountTotal, taxTotal, withholdingTotal, total };
}

export type PayableStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

/**
 * Derive the status of an issued invoice from its payments and due date.
 * DRAFT and VOID are terminal/manual states and never change automatically.
 */
export function deriveInvoiceStatus(input: {
  current: PayableStatus;
  total: Numeric;
  amountPaid: Numeric;
  dueDate?: Date | null;
  now?: Date;
}): PayableStatus {
  if (input.current === "DRAFT" || input.current === "VOID") return input.current;
  const total = D(input.total);
  const paid = D(input.amountPaid);
  if (total.gt(0) && paid.gte(total)) return "PAID";
  const now = input.now ?? new Date();
  const overdue = !!input.dueDate && input.dueDate.getTime() < startOfDay(now).getTime();
  if (overdue) return "OVERDUE";
  return paid.gt(0) ? "PARTIALLY_PAID" : "ISSUED";
}

export function balanceDue(total: Numeric, amountPaid: Numeric): Decimal {
  const b = D(total).sub(D(amountPaid));
  return b.isNegative() ? D(0) : b;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
