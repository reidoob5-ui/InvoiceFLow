import { renderDocumentPdf, type PdfDocument } from "@/lib/pdf/document-pdf";
import { balanceDue } from "@/lib/invoice-calc";
import { buyerFromClient, parseSnapshot, sellerFromOrganization, snapshotToPdfDocument } from "@/lib/snapshot";

type InvoiceForPdf = {
  type: "INVOICE" | "CREDIT_NOTE"; number: string | null; status: string; currency: string;
  issueDate: Date | null; dueDate: Date | null; snapshot: unknown;
  subtotal: unknown; discountTotal: unknown; taxTotal: unknown; withholdingTotal: unknown; total: unknown; amountPaid: unknown;
  notes: string | null; terms: string | null;
  client: Parameters<typeof buyerFromClient>[0];
  organization: Parameters<typeof sellerFromOrganization>[0];
  lines: Array<{ description: string; quantity: unknown; unitPrice: unknown; discountPercent: unknown; taxRate: unknown; lineTotal: unknown }>;
};

/**
 * Issued documents are rendered from their frozen snapshot, so editing the client or the
 * organization afterwards never changes a reprint. Drafts (and legacy invoices issued before
 * snapshots existed) fall back to live data.
 */
export async function renderInvoicePdf(invoice: InvoiceForPdf): Promise<Buffer> {
  const balance = invoice.type === "CREDIT_NOTE" ? "0.00" : balanceDue(String(invoice.total), String(invoice.amountPaid)).toFixed(2);
  const live = { status: invoice.status, amountPaid: String(invoice.amountPaid), balanceDue: balance };
  const snapshot = invoice.status !== "DRAFT" ? parseSnapshot(invoice.snapshot) : null;
  if (snapshot) return renderDocumentPdf(snapshotToPdfDocument(snapshot, live));

  const doc: PdfDocument = {
    kind: invoice.type, number: invoice.number || "RASCUNHO", status: invoice.status,
    locale: invoice.organization.locale, currency: invoice.currency, issueDate: invoice.issueDate, dueDate: invoice.dueDate,
    brandColor: invoice.organization.brandColor, logoDataUrl: invoice.organization.logoDataUrl,
    seller: sellerFromOrganization(invoice.organization), buyer: buyerFromClient(invoice.client),
    items: invoice.lines.map((line) => ({
      description: line.description, quantity: String(line.quantity), unitPrice: String(line.unitPrice),
      discountPercent: String(line.discountPercent), taxRate: String(line.taxRate), lineTotal: String(line.lineTotal),
    })),
    subtotal: String(invoice.subtotal), discountTotal: String(invoice.discountTotal), taxTotal: String(invoice.taxTotal),
    withholdingTotal: String(invoice.withholdingTotal), total: String(invoice.total),
    amountPaid: live.amountPaid, balanceDue: live.balanceDue, notes: invoice.notes, terms: invoice.terms,
  };
  return renderDocumentPdf(doc);
}
