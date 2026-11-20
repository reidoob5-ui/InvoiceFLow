import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { balanceDue, deriveInvoiceStatus } from "@/lib/invoice-calc";
import { D } from "@/lib/money";
import { retryOnConflict } from "@/lib/tx-retry";

export const runtime = "nodejs";

/** A empresa confirma (regista o recebimento) ou rejeita um aviso de pagamento do cliente. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "payments:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para registar recebimentos." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const body = await request.json().catch(() => null);
  const action = body?.action === "confirm" ? "confirm" : body?.action === "reject" ? "reject" : null;
  if (!action) return NextResponse.json({ error: "Acção inválida." }, { status: 400 });

  const result = await retryOnConflict(() => prisma.$transaction(async (tx) => {
    const notice = await tx.paymentNotice.findFirst({ where: { id, organizationId } });
    if (!notice) return { error: "NOT_FOUND" as const };
    if (notice.status !== "PENDING") return { error: "RESOLVED" as const };
    const now = new Date();
    if (action === "reject") {
      await tx.paymentNotice.update({ where: { id }, data: { status: "REJECTED", resolvedAt: now, resolvedById: current.user.id } });
      return { ok: true as const, status: "REJECTED" };
    }
    const invoice = await tx.invoice.findFirst({ where: { id: notice.invoiceId, organizationId }, select: { id: true, clientId: true, type: true, status: true, total: true, amountPaid: true, currency: true, dueDate: true } });
    if (!invoice || invoice.type !== "INVOICE" || invoice.status === "DRAFT" || invoice.status === "VOID") return { error: "NOT_PAYABLE" as const };
    const paid = D(invoice.amountPaid);
    const remaining = balanceDue(invoice.total, paid);
    const amount = D(notice.amount);
    if (amount.gt(remaining)) return { error: "EXCEEDS" as const, remaining: remaining.toFixed(2), currency: invoice.currency };
    const payment = await tx.payment.create({
      data: { organizationId, invoiceId: invoice.id, clientId: invoice.clientId, amount: amount.toFixed(2), currency: invoice.currency, method: "BANK_TRANSFER", status: "CONFIRMED", reference: notice.reference, notes: `Aviso do cliente (${notice.payerName})${notice.note ? `: ${notice.note}` : ""}`.slice(0, 1000), createdById: current.user.id },
      select: { id: true },
    });
    const nextPaid = paid.add(amount);
    const nextStatus = deriveInvoiceStatus({ current: invoice.status, total: invoice.total, amountPaid: nextPaid, dueDate: invoice.dueDate });
    await tx.invoice.update({ where: { id: invoice.id }, data: { amountPaid: nextPaid.toFixed(2), status: nextStatus, events: { create: { userId: current.user.id, action: "payment_recorded", data: { paymentId: payment.id, amount: amount.toFixed(2), noticeId: id } } } } });
    await tx.paymentNotice.update({ where: { id }, data: { status: "CONFIRMED", resolvedAt: now, resolvedById: current.user.id } });
    return { ok: true as const, status: "CONFIRMED", paymentId: payment.id, invoiceId: invoice.id };
  }, { isolationLevel: "Serializable" }));

  if ("error" in result) {
    if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Aviso não encontrado." }, { status: 404 });
    if (result.error === "RESOLVED") return NextResponse.json({ error: "Este aviso já foi tratado." }, { status: 409 });
    if (result.error === "NOT_PAYABLE") return NextResponse.json({ error: "A factura já não admite pagamentos." }, { status: 409 });
    return NextResponse.json({ error: `O valor excede o saldo em aberto (${result.remaining} ${result.currency}). Rejeite o aviso ou registe o recebimento manualmente.` }, { status: 400 });
  }
  await audit({ action: `payment_notice.${action}ed`, userId: current.user.id, organizationId, entityType: "PaymentNotice", entityId: id });
  return NextResponse.json(result);
}
