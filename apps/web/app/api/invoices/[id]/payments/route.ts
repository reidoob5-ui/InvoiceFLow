import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { balanceDue, deriveInvoiceStatus } from "@/lib/invoice-calc";
import { D } from "@/lib/money";
import { retryOnConflict } from "@/lib/tx-retry";

export const runtime = "nodejs";
const methods = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "CHECK", "OTHER"] as const;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "payments:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para registar recebimentos." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const amountText = String(body?.amount ?? "").trim();
  const method = methods.includes(body?.method) ? body.method : "BANK_TRANSFER";
  const reference = typeof body?.reference === "string" ? body.reference.trim().slice(0, 120) || null : null;
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 1000) || null : null;
  if (!/^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,2})?$/.test(amountText)) return NextResponse.json({ error: "Indica um valor positivo com, no máximo, duas casas decimais." }, { status: 400 });
  const parsedAmount = D(amountText);
  if (!parsedAmount.isFinite() || parsedAmount.lte(0)) return NextResponse.json({ error: "O valor recebido deve ser superior a zero." }, { status: 400 });
  const organizationId = current.membership.organizationId;
  const result = await retryOnConflict(() => prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id, organizationId }, select: { id: true, clientId: true, status: true, total: true, amountPaid: true, currency: true, dueDate: true } });
    if (!invoice) return { error: "NOT_FOUND" as const };
    if (invoice.status === "DRAFT" || invoice.status === "VOID") return { error: "NOT_PAYABLE" as const };
    const paid = await tx.payment.aggregate({ where: { invoiceId: id, organizationId, status: "CONFIRMED" }, _sum: { amount: true } });
    const currentPaid = D(paid._sum.amount);
    const remaining = balanceDue(invoice.total, currentPaid);
    const paymentAmount = parsedAmount;
    if (paymentAmount.gt(remaining)) return { error: "EXCEEDS_BALANCE" as const, remaining: remaining.toFixed(2), currency: invoice.currency };
    const payment = await tx.payment.create({
      data: { organizationId, invoiceId: id, clientId: invoice.clientId, amount: paymentAmount.toFixed(2), currency: invoice.currency, method, status: "CONFIRMED", reference, notes, createdById: current.user.id },
      select: { id: true, amount: true, currency: true, method: true, receivedAt: true, reference: true },
    });
    const nextPaid = currentPaid.add(paymentAmount);
    const nextStatus = deriveInvoiceStatus({ current: invoice.status, total: invoice.total, amountPaid: nextPaid, dueDate: invoice.dueDate });
    await tx.invoice.update({ where: { id }, data: { amountPaid: nextPaid.toFixed(2), status: nextStatus, events: { create: { userId: current.user.id, action: "payment_recorded", data: { paymentId: payment.id, amount: paymentAmount.toFixed(2) } } } } });
    return { payment, amountPaid: nextPaid.toFixed(2), balanceDue: balanceDue(invoice.total, nextPaid).toFixed(2), status: nextStatus };
  }, { isolationLevel: "Serializable" }));
  if ("error" in result) {
    if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Factura não encontrada." }, { status: 404 });
    if (result.error === "NOT_PAYABLE") return NextResponse.json({ error: "Só é possível receber pagamentos de facturas emitidas." }, { status: 409 });
    return NextResponse.json({ error: `O valor excede o saldo em aberto (${result.remaining} ${current.membership.organization.currency}).` }, { status: 400 });
  }
  await audit({ action: "invoice.payment_recorded", userId: current.user.id, organizationId, entityType: "Invoice", entityId: id, metadata: { paymentId: result.payment.id, amount: result.payment.amount } });
  return NextResponse.json(result, { status: 201 });
}
