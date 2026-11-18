import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { D } from "@/lib/money";

export const runtime = "nodejs";
const methods = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "CHECK", "PROVIDER", "OTHER"] as const;
const statuses = ["PENDING", "PAID"] as const;

function parseInput(body: unknown) {
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 240) : "";
  const amountText = typeof input.amount === "string" || typeof input.amount === "number" ? String(input.amount).trim() : "";
  const amount = Number(amountText);
  const taxText = typeof input.taxAmount === "string" || typeof input.taxAmount === "number" ? String(input.taxAmount).trim() : "0";
  const taxAmount = Number(taxText);
  const date = typeof input.date === "string" ? new Date(input.date) : new Date(NaN);
  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  if (description.length < 2) return { error: "A descrição deve ter pelo menos 2 caracteres." };
  if (!amountText || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999) return { error: "Indica um valor válido superior a zero." };
  if (!Number.isFinite(taxAmount) || taxAmount < 0 || taxAmount > amount) return { error: "O imposto deve ser válido e não pode exceder o valor da despesa." };
  if (Number.isNaN(date.getTime())) return { error: "Indica uma data válida." };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "A moeda deve usar um código de três letras, como AOA ou USD." };
  if (input.paymentMethod && (typeof input.paymentMethod !== "string" || !methods.includes(input.paymentMethod as typeof methods[number]))) return { error: "Método de pagamento inválido." };
  if (input.status && (typeof input.status !== "string" || !statuses.includes(input.status as typeof statuses[number]))) return { error: "Estado da despesa inválido." };
  try { if (!D(amountText).isFinite() || !D(taxText).isFinite()) return { error: "Valor inválido." }; } catch { return { error: "Valor inválido." }; }
  return { value: { description, amount: D(amountText).toFixed(2), taxAmount: D(taxText).toFixed(2), date, currency, status: input.status === "PENDING" ? "PENDING" as const : "PAID" as const, paymentMethod: typeof input.paymentMethod === "string" && methods.includes(input.paymentMethod as typeof methods[number]) ? input.paymentMethod as typeof methods[number] : null, supplierId: typeof input.supplierId === "string" ? input.supplierId : null, categoryName: typeof input.categoryName === "string" ? input.categoryName.trim().slice(0, 80) : "" } };
}

export async function GET(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "expenses:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const organizationId = current.membership.organizationId;
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const status = request.nextUrl.searchParams.get("status");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const where = {
    organizationId,
    ...(statuses.includes(status as typeof statuses[number]) ? { status: status as typeof statuses[number] } : {}),
    ...(from && !Number.isNaN(Date.parse(from)) ? { date: { gte: new Date(from) } } : {}),
    ...(to && !Number.isNaN(Date.parse(to)) ? { date: { lte: new Date(to + "T23:59:59.999Z") } } : {}),
    ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [expenses, categories, suppliers, totals] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 300, include: { supplier: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } } }),
    prisma.category.findMany({ where: { organizationId, kind: "EXPENSE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.expense.groupBy({ by: ["currency", "status"], where: { organizationId }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  return NextResponse.json({ defaultCurrency: current.membership.organization.currency || "AOA", expenses, categories, suppliers, totalsByCurrency: Object.fromEntries([...new Set(totals.map((item) => item.currency))].map((currency) => [currency, Object.fromEntries(totals.filter((item) => item.currency === currency).map((item) => [item.status, { amount: item._sum.amount?.toString() ?? "0", count: item._count._all }]))])) });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "expenses:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const body = await request.json().catch(() => null);
  const parsed = parseInput(body);
  if (parsed.error || !parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const organizationId = current.membership.organizationId;
  if (parsed.value.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: parsed.value.supplierId, organizationId, archivedAt: null }, select: { id: true } });
    if (!supplier) return NextResponse.json({ error: "Fornecedor não encontrado nesta empresa." }, { status: 400 });
  }
  const expense = await prisma.$transaction(async (tx) => {
    const category = parsed.value.categoryName ? await tx.category.upsert({
      where: { organizationId_kind_name: { organizationId, kind: "EXPENSE", name: parsed.value.categoryName } },
      update: {}, create: { organizationId, kind: "EXPENSE", name: parsed.value.categoryName },
    }) : null;
    return tx.expense.create({ data: {
      organizationId, description: parsed.value.description, amount: parsed.value.amount, taxAmount: parsed.value.taxAmount,
      date: parsed.value.date, currency: parsed.value.currency, status: parsed.value.status,
      paymentMethod: parsed.value.paymentMethod, supplierId: parsed.value.supplierId, categoryId: category?.id ?? null,
      createdById: current.user.id,
    }, include: { supplier: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } } });
  });
  await audit({ action: "expense.created", userId: current.user.id, organizationId, entityType: "Expense", entityId: expense.id });
  return NextResponse.json({ expense }, { status: 201 });
}
