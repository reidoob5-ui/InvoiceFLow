import { computeTotals, type DocumentTotals } from "@/lib/invoice-calc";
import { D, type Numeric } from "@/lib/money";

export class CreditNoteError extends Error {
  constructor(public code: "NO_LINES" | "UNKNOWN_LINE" | "BAD_QUANTITY" | "EXCEEDS_INVOICE", message: string) {
    super(message);
  }
}

export type OriginalLine = {
  id: string; productId: string | null; description: string; quantity: Numeric; unitPrice: Numeric;
  discountPercent: Numeric; taxRate: Numeric; taxName: string | null;
};
export type RequestedCreditLine = { lineId: string; quantity: Numeric };

export type PlannedCreditLine = {
  productId: string | null; position: number; description: string; quantity: string; unitPrice: string;
  discountPercent: string; taxRate: string; taxName: string | null; lineTotal: string;
};

/**
 * Decide which lines (and quantities) a credit note reverses and what it totals.
 * With no explicit lines, the credit note reverses the whole original invoice, which by
 * construction yields exactly the original total (same maths, same rounding).
 * The cumulative credited amount can never exceed the original invoice total.
 */
export function planCreditNote(input: {
  originalLines: OriginalLine[];
  requested?: RequestedCreditLine[] | null;
  withholdingRate: Numeric;
  originalTotal: Numeric;
  alreadyCredited: Numeric;
}): { lines: PlannedCreditLine[]; totals: DocumentTotals } {
  const byId = new Map(input.originalLines.map((line) => [line.id, line]));
  const picked: Array<{ line: OriginalLine; quantity: ReturnType<typeof D> }> = [];

  if (input.requested && input.requested.length) {
    const seen = new Set<string>();
    for (const item of input.requested) {
      const line = byId.get(item.lineId);
      if (!line) throw new CreditNoteError("UNKNOWN_LINE", "Uma das linhas indicadas não pertence a esta factura.");
      if (seen.has(item.lineId)) throw new CreditNoteError("UNKNOWN_LINE", "A mesma linha foi indicada mais do que uma vez.");
      seen.add(item.lineId);
      const quantity = D(item.quantity);
      if (!quantity.isFinite() || quantity.lte(0) || quantity.gt(D(line.quantity))) {
        throw new CreditNoteError("BAD_QUANTITY", "A quantidade a creditar deve ser superior a zero e não exceder a da factura.");
      }
      picked.push({ line, quantity });
    }
  } else {
    for (const line of input.originalLines) picked.push({ line, quantity: D(line.quantity) });
  }
  if (!picked.length) throw new CreditNoteError("NO_LINES", "A nota de crédito precisa de pelo menos uma linha.");

  const totals = computeTotals(
    picked.map(({ line, quantity }) => ({
      quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, taxRate: line.taxRate,
    })),
    { withholdingRate: input.withholdingRate },
  );

  if (totals.total.lte(0)) throw new CreditNoteError("NO_LINES", "O valor da nota de crédito deve ser superior a zero.");
  if (D(input.alreadyCredited).add(totals.total).gt(D(input.originalTotal))) {
    throw new CreditNoteError("EXCEEDS_INVOICE", "O total creditado não pode exceder o total da factura.");
  }

  return {
    totals,
    lines: picked.map(({ line, quantity }, index) => ({
      productId: line.productId, position: index, description: line.description,
      quantity: quantity.toString(), unitPrice: D(line.unitPrice).toString(),
      discountPercent: D(line.discountPercent).toString(), taxRate: D(line.taxRate).toString(),
      taxName: line.taxName, lineTotal: totals.lines[index].net.toFixed(2),
    })),
  };
}
