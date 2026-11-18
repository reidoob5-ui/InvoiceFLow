import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { withOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para criar facturas." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const execution = await withOrganizationPlanLimit(organizationId, "maxInvoicesPerMonth", 1, async (tx) => {
    const quote = await tx.quote.findFirst({ where: { id, organizationId }, include: { lines: { orderBy: { position: "asc" } } } });
    if (!quote) return { error: "NOT_FOUND" as const };
    if (quote.status !== "ACCEPTED") return { error: "NOT_ACCEPTED" as const };
    if (quote.convertedInvoiceId) return { error: "ALREADY_CONVERTED" as const };
    if (!quote.lines.length) return { error: "EMPTY" as const };
    const invoice = await tx.invoice.create({
      data: {
        organizationId, clientId: quote.clientId, createdById: current.user.id,
        status: "DRAFT", currency: quote.currency,
        subtotal: quote.subtotal, discountTotal: quote.discountTotal, taxTotal: quote.taxTotal,
        total: quote.total, notes: quote.notes, terms: quote.terms,
        lines: { create: quote.lines.map((line) => ({
          productId: line.productId, position: line.position, description: line.description,
          quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent,
          taxRate: line.taxRate, taxName: null, taxRateId: null, lineTotal: line.lineTotal,
        })) },
        events: { create: { userId: current.user.id, action: "created_from_quote", data: { quoteId: quote.id } } },
      },
      select: { id: true, status: true, currency: true, total: true, createdAt: true },
    });
    await tx.quote.update({ where: { id: quote.id }, data: {
      status: "CONVERTED", convertedInvoiceId: invoice.id,
      events: { create: { userId: current.user.id, action: "converted", note: invoice.id } },
    } });
    return { invoice };
  });
  if (!execution.allowed) return NextResponse.json(planLimitResponse(execution.result), { status: 402 });
  const result = execution.value;
  if ("error" in result && result.error) {
    const messages: Record<string, string> = {
      NOT_FOUND: "Orçamento não encontrado.", NOT_ACCEPTED: "Só é possível converter orçamentos aceites.",
      ALREADY_CONVERTED: "Este orçamento já foi convertido.", EMPTY: "O orçamento não tem linhas.",
    };
    return NextResponse.json({ error: messages[result.error] }, { status: result.error === "NOT_FOUND" ? 404 : 409 });
  }
  await audit({ action: "quote.converted_to_invoice", userId: current.user.id, organizationId, entityType: "Quote", entityId: id, metadata: { invoiceId: result.invoice.id } });
  return NextResponse.json({ invoice: result.invoice }, { status: 201 });
}
