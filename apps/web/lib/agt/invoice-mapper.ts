/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DocumentInput } from "./document";
import { computeLine, computeTotals } from "./calc";
import { centsToNumber } from "./decimal";
import { luandaParts } from "./series";

export class InvoiceMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceMappingError";
  }
}

type InvoiceLike = {
  type: "INVOICE" | "CREDIT_NOTE";
  currency: string;
  issueDate: Date | null;
  total: { toString(): string } | number | string;
  client: { taxId: string | null; country: string | null };
  lines: Array<{ description: string; quantity: any; unitPrice: any; discountPercent: any; taxRate: any; taxName: string | null; productId: string | null }>;
};

/**
 * Converte uma factura/nota de crédito do InvoiceFlow no documento fiscal AGT (FT / NC).
 * Salvaguardas: só AOA; o total fiscal (IVA arredondado por excesso) tem de coincidir com o total da factura;
 * linhas a 0% exigem um código de isenção explícito (Tabela 4) — nunca adivinhamos.
 */
export function invoiceToFiscalInput(
  invoice: InvoiceLike,
  o: { seriesCode: string; seriesYear: number; exemptionCode?: string; originalDocumentNo?: string },
): DocumentInput {
  if (invoice.currency !== "AOA") throw new InvoiceMappingError("A facturação AGT exige facturas em AOA. Emita em kwanzas.");
  const isCredit = invoice.type === "CREDIT_NOTE";
  if (isCredit && !o.originalDocumentNo) throw new InvoiceMappingError("A factura original ainda não tem documento fiscal AGT.");
  if (!invoice.lines.length) throw new InvoiceMappingError("A factura não tem linhas.");

  const lines = invoice.lines.map((l, i) => {
    const rate = Number(l.taxRate.toString());
    const tax =
      rate === 0
        ? (() => {
            if (!o.exemptionCode) throw new InvoiceMappingError(`Linha ${i + 1} com IVA 0%: indique o código de isenção (ex.: M02, M10…).`);
            return { taxType: "IVA", taxCode: "ISE", taxExemptionCode: o.exemptionCode };
          })()
        : rate === 14
          ? { taxType: "IVA", taxCode: "NOR" }
          : { taxType: "IVA", taxCode: "OUT", taxPercentage: rate.toString() };
    return {
      operationType: "SG", // PRESSUPOSTO: tipo de operação por defeito; confirmar por actividade com a AGT
      productCode: (l.productId ?? `LINHA${i + 1}`).slice(0, 60),
      productDescription: l.description.slice(0, 200),
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      unitOfMeasure: "UN",
      ...(Number(l.discountPercent.toString()) > 0 ? { discountPercent: l.discountPercent.toString() } : {}),
      tax,
      ...(isCredit ? { referenceInfo: { reference: o.originalDocumentNo! } } : {}),
    };
  });

  // Confere o total fiscal com o total da factura antes de emitir (o documento fiscal é imutável).
  const computed = computeTotals(lines.map((l, i) => computeLine(l as any, {}, i + 1)));
  const fiscalTotal = centsToNumber(computed.grossCents);
  const invoiceTotal = Number(Number(invoice.total.toString()).toFixed(2));
  if (Math.abs(fiscalTotal - invoiceTotal) > 0.005) {
    throw new InvoiceMappingError(`O total fiscal (${fiscalTotal.toFixed(2)}) difere do total da factura (${invoiceTotal.toFixed(2)}) — o IVA fiscal arredonda por excesso. Reveja as linhas.`);
  }

  return {
    documentType: isCredit ? "NC" : "FT",
    seriesCode: o.seriesCode,
    seriesYear: o.seriesYear,
    documentDate: invoice.issueDate ? new Date(invoice.issueDate.getTime() + 3600_000).toISOString().slice(0, 10) : luandaParts().date,
    customer: { taxId: invoice.client.taxId ?? undefined, country: invoice.client.country ?? "AO" },
    lines: lines as any,
  };
}
