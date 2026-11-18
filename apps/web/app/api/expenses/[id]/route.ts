import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { parseMoneyInput } from "@/lib/money";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const methods = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "CHECK", "PROVIDER", "OTHER"] as const;
const statuses = ["PENDING", "PAID"] as const;

export async function PATCH(request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "expenses:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 240) : "";
  const amount = parseMoneyInput(body?.amount);
  const taxAmount = parseMoneyInput(body?.taxAmount ?? "0");
  const date = typeof body?.date === "string" ? new Date(body.date) : new Date(NaN);
  const currency = typeof body?.currency === "string" ? body.currency.trim().toUpperCase() : "";
  if (description.length < 2 || !amount || amount.lte(0) || !taxAmount || taxAmount.isNegative() || taxAmount.gt(amount) || Number.isNaN(date.getTime()) || !/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Confirma a descrição, valores positivos com no máximo duas casas decimais, a data e a moeda." }, { status: 400 });
  if (body?.paymentMethod && !methods.includes(body.paymentMethod)) return NextResponse.json({ error: "Método de pagamento inválido." }, { status: 400 });
  if (body?.status && !statuses.includes(body.status)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  const organizationId = current.membership.organizationId;
  const existing = await prisma.expense.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Despesa não encontrada." }, { status: 404 });
  const supplierId = typeof body?.supplierId === "string" && body.supplierId ? body.supplierId : null;
  if (supplierId && !await prisma.supplier.findFirst({ where: { id: supplierId, organizationId, archivedAt: null }, select: { id: true } })) return NextResponse.json({ error: "Fornecedor não encontrado nesta empresa." }, { status: 400 });
  const categoryName = typeof body?.categoryName === "string" ? body.categoryName.trim().slice(0, 80) : "";
  const expense = await prisma.$transaction(async (tx) => {
    const category = categoryName ? await tx.category.upsert({ where: { organizationId_kind_name: { organizationId, kind: "EXPENSE", name: categoryName } }, update: {}, create: { organizationId, kind: "EXPENSE", name: categoryName } }) : null;
    return tx.expense.update({ where: { id }, data: {
      description, amount: amount.toFixed(2), taxAmount: taxAmount.toFixed(2), date, currency,
      status: body?.status === "PENDING" ? "PENDING" : "PAID",
      paymentMethod: methods.includes(body?.paymentMethod) ? body.paymentMethod : null,
      supplierId, categoryId: category?.id ?? null,
    }, include: { supplier: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } } });
  });
  await audit({ action: "expense.updated", userId: current.user.id, organizationId, entityType: "Expense", entityId: id });
  return NextResponse.json({ expense });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "expenses:delete"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params, organizationId = current.membership.organizationId;
  const result = await prisma.expense.deleteMany({ where: { id, organizationId } });
  if (!result.count) return NextResponse.json({ error: "Despesa não encontrada." }, { status: 404 });
  await audit({ action: "expense.deleted", userId: current.user.id, organizationId, entityType: "Expense", entityId: id });
  return NextResponse.json({ deleted: true });
}
