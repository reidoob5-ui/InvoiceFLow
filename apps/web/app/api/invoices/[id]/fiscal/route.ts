import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { FiscalError, issueFiscalDocument } from "@/lib/agt/service";
import { InvoiceMappingError, invoiceToFiscalInput } from "@/lib/agt/invoice-mapper";
import { DocumentValidationError } from "@/lib/agt/document";
import { luandaParts } from "@/lib/agt/series";

export const runtime = "nodejs";

/** Certifica uma factura/nota de crédito emitida: gera o documento fiscal AGT (FT/NC), assina-o e coloca-o na fila de envio. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "fiscal:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const body = await request.json().catch(() => null);
  const exemptionCode = typeof body?.exemptionCode === "string" ? body.exemptionCode.trim().slice(0, 4) : undefined;

  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId },
    include: { client: { select: { taxId: true, country: true } }, lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Factura não encontrada." }, { status: 404 });
  if (invoice.status === "DRAFT" || !invoice.number) return NextResponse.json({ error: "Emita a factura antes de a certificar." }, { status: 409 });
  if (invoice.status === "VOID") return NextResponse.json({ error: "Factura anulada." }, { status: 409 });
  if (await prisma.fiscalDocument.findUnique({ where: { invoiceId: id }, select: { id: true } })) {
    return NextResponse.json({ error: "Esta factura já tem documento fiscal." }, { status: 409 });
  }

  try {
    const docType = invoice.type === "CREDIT_NOTE" ? "NC" : "FT";
    const year = Number(luandaParts().date.slice(0, 4));
    const series = await prisma.fiscalSeries.findFirst({
      where: { organizationId, documentType: docType, year, status: { not: "F" } }, orderBy: { createdAt: "desc" },
    });
    if (!series) throw new FiscalError(`Não há série ${docType} para ${year}. Peça uma série à AGT em Definições fiscais.`, "SERIES_NOT_FOUND");

    let originalDocumentNo: string | undefined;
    if (invoice.type === "CREDIT_NOTE" && invoice.creditedInvoiceId) {
      const orig = await prisma.fiscalDocument.findUnique({ where: { invoiceId: invoice.creditedInvoiceId }, select: { documentNo: true } });
      originalDocumentNo = orig?.documentNo;
    }
    const input = invoiceToFiscalInput(invoice as never, { seriesCode: series.code, seriesYear: series.year, exemptionCode, originalDocumentNo });
    const result = await issueFiscalDocument(organizationId, input, { invoiceId: id });
    await audit({ organizationId, userId: current.user.id, action: "fiscal.document.issued", entityType: "Invoice", entityId: id, metadata: { documentNo: result.documentNo } });
    return NextResponse.json({ ok: true, documentNo: result.documentNo, qrUrl: result.qrUrl, deadlineAt: result.deadlineAt }, { status: 201 });
  } catch (error) {
    if (error instanceof FiscalError || error instanceof InvoiceMappingError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof DocumentValidationError) return NextResponse.json({ error: "Documento fiscal inválido.", details: error.errors }, { status: 422 });
    throw error;
  }
}

/** Estado fiscal de uma factura (para o cartão na página da factura). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "fiscal:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const doc = await prisma.fiscalDocument.findFirst({
    where: { invoiceId: id, organizationId },
    select: { documentNo: true, documentType: true, documentDate: true, delivery: { select: { state: true, deadlineAt: true, errors: true } } },
  });
  return NextResponse.json({ fiscal: doc });
}
