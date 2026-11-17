import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { renderDocumentPdf } from "@/lib/pdf/document-pdf";
import { balanceDue } from "@/lib/invoice-calc";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: current.membership.organizationId },
    include: { client: true, organization: true, lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Factura não encontrada." }, { status: 404 });
  const pdf = await renderDocumentPdf({
    kind: invoice.type, number: invoice.number || "RASCUNHO", status: invoice.status,
    locale: invoice.organization.locale, currency: invoice.currency, issueDate: invoice.issueDate, dueDate: invoice.dueDate,
    brandColor: invoice.organization.brandColor, logoDataUrl: invoice.organization.logoDataUrl,
    seller: { name: invoice.organization.legalName || invoice.organization.name, taxId: invoice.organization.taxId, lines: [invoice.organization.addressLine1, invoice.organization.addressLine2, invoice.organization.city, invoice.organization.country, invoice.organization.email, invoice.organization.phone].filter((x): x is string => !!x) },
    buyer: { name: invoice.client.company || invoice.client.name, taxId: invoice.client.taxId, lines: [invoice.client.addressLine1, invoice.client.addressLine2, invoice.client.city, invoice.client.country, invoice.client.email, invoice.client.phone].filter((x): x is string => !!x) },
    items: invoice.lines.map((line) => ({ description: line.description, quantity: String(line.quantity), unitPrice: String(line.unitPrice), discountPercent: String(line.discountPercent), taxRate: String(line.taxRate), lineTotal: String(line.lineTotal) })),
    subtotal: String(invoice.subtotal), discountTotal: String(invoice.discountTotal), taxTotal: String(invoice.taxTotal),
    withholdingTotal: String(invoice.withholdingTotal), total: String(invoice.total), amountPaid: String(invoice.amountPaid),
    balanceDue: balanceDue(invoice.total, invoice.amountPaid).toFixed(2), notes: invoice.notes, terms: invoice.terms,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoice.number || "invoice"}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
