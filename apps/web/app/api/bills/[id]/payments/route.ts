import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { D } from "@/lib/money";
import { retryOnConflict } from "@/lib/tx-retry";

export const runtime = "nodejs";
const methods = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "CHECK", "PROVIDER", "OTHER"] as const;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "expenses:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const amountText = String(body?.amount ?? "").trim();
  const method = typeof body?.method === "string" && methods.includes(body.method as typeof methods[number]) ? body.method as typeof methods[number] : "BANK_TRANSFER";
  const reference = typeof body?.reference === "string" ? body.reference.trim().slice(0, 120) || null : null;
  const paidAt = typeof body?.paidAt === "string" ? new Date(body.paidAt) : new Date();
  if (!/^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,2})?$/.test(amountText) || Number.isNaN(paidAt.getTime())) return NextResponse.json({ error: "Indica um valor positivo com, no máximo, duas casas decimais e uma data válida." }, { status: 400 });
  const amount = D(amountText);
  if (!amount.isFinite() || amount.lte(0)) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  const organizationId = current.membership.organizationId;
  const result = await retryOnConflict(() => prisma.$transaction(async tx => {
    const bill = await tx.bill.findFirst({ where: { id, organizationId }, select: { id: true, total: true, status: true, amountPaid: true } });
    if (!bill) return { error: "NOT_FOUND" as const };
    if (bill.status === "VOID") return { error: "VOID" as const };
    const payments = await tx.billPayment.aggregate({ where: { billId: id, organizationId }, _sum: { amount: true } });
    const alreadyPaid = D(payments._sum.amount);
    const remaining = D(bill.total).minus(alreadyPaid);
    if (amount.gt(remaining)) return { error: "EXCEEDS" as const, remaining: remaining.toFixed(2) };
    const payment = await tx.billPayment.create({ data: { organizationId, billId: id, amount: amount.toFixed(2), method, reference, paidAt } });
    const paid = alreadyPaid.plus(amount);
    const status = paid.gte(bill.total) ? "PAID" : "PARTIALLY_PAID";
    await tx.bill.update({ where: { id }, data: { amountPaid: paid.toFixed(2), status } });
    return { payment, amountPaid: paid.toFixed(2), balanceDue: D(bill.total).minus(paid).toFixed(2), status };
  }, { isolationLevel: "Serializable" }));
  if ("error" in result) {
    if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Factura de fornecedor não encontrada." }, { status: 404 });
    if (result.error === "VOID") return NextResponse.json({ error: "Esta factura foi anulada." }, { status: 409 });
    return NextResponse.json({ error: `O pagamento excede o saldo em aberto (${result.remaining}).` }, { status: 400 });
  }
  await audit({ action: "bill.payment_recorded", userId: current.user.id, organizationId, entityType: "Bill", entityId: id, metadata: { paymentId: result.payment.id, amount: result.payment.amount } });
  return NextResponse.json(result, { status: 201 });
}
