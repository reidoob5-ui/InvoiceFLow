import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { calculatePreparedLines, InvoiceInputError, prepareInvoiceLines } from "@/lib/invoices";
import { retryOnConflict } from "@/lib/tx-retry";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
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
    include: { client: true, lines: { orderBy: { position: "asc" } }, payments: { where: { status: "CONFIRMED" }, orderBy: { receivedAt: "desc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Factura não encontrada." }, { status: 404 });
  return NextResponse.json({ invoice });
}

export async function PATCH(request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId, archivedAt: null }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : current.membership.organization.currency;
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Moeda inválida." }, { status: 400 });
  const termsDays = Number(body.paymentTermsDays ?? 30);
  const withholdingRate = Number(body.withholdingRate ?? 0);
  if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365 || !Number.isFinite(withholdingRate) || withholdingRate < 0 || withholdingRate > 100)
    return NextResponse.json({ error: "Prazo ou retenção inválidos." }, { status: 400 });
  try {
    const lines = await prepareInvoiceLines(body.lines, organizationId, currency);
    const calculated = calculatePreparedLines(lines, withholdingRate);
    // The DRAFT check lives INSIDE a Serializable transaction. Checking outside left a window in which a
    // concurrent issue could commit and this request would then rewrite the lines/totals of an issued invoice.
    // On a conflict, Prisma raises P2034 and `retryOnConflict` re-reads the (now ISSUED) row and answers 409.
    const result = await retryOnConflict(() => prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({ where: { id, organizationId }, select: { status: true, type: true } });
      if (!existing) return { error: "NOT_FOUND" as const };
      if (existing.status !== "DRAFT" || existing.type !== "INVOICE") return { error: "NOT_DRAFT" as const };
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          clientId, paymentTermsDays: termsDays, withholdingRate,
          currency,
          notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) || null : null,
          terms: typeof body.terms === "string" ? body.terms.trim().slice(0, 4000) || null : null,
          ...calculated, lines: { create: calculated.lines },
          events: { create: { userId: current.user.id, action: "updated" } },
        },
        select: { id: true, status: true, currency: true, subtotal: true, discountTotal: true, taxTotal: true, withholdingTotal: true, total: true, updatedAt: true },
      });
      return { invoice };
    }, { isolationLevel: "Serializable" }));
    if ("error" in result) {
      return result.error === "NOT_FOUND"
        ? NextResponse.json({ error: "Factura não encontrada." }, { status: 404 })
        : NextResponse.json({ error: "Só é possível editar facturas em rascunho." }, { status: 409 });
    }
    await audit({ action: "invoice.updated", userId: current.user.id, organizationId, entityType: "Invoice", entityId: id });
    return NextResponse.json({ invoice: result.invoice });
  } catch (error) {
    if (error instanceof InvoiceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
