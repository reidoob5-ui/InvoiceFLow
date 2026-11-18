import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { D } from "@/lib/money";

export const runtime = "nodejs";
const statuses = ["OPEN", "PARTIALLY_PAID", "PAID", "VOID"] as const;

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
  const bills = await prisma.bill.findMany({
    where: { organizationId,
      ...(statuses.includes(status as typeof statuses[number]) ? { status: status as typeof statuses[number] } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { is: { name: { contains: q, mode: "insensitive" } } } }] } : {}) },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 300,
    include: { supplier: { select: { id: true, name: true } }, payments: { orderBy: { paidAt: "desc" }, take: 10, select: { id: true, amount: true, method: true, reference: true, paidAt: true } } },
  });
  const suppliers = await prisma.supplier.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return NextResponse.json({ bills, suppliers, defaultCurrency: current.membership.organization.currency || "AOA" });
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
  const supplierId = typeof body?.supplierId === "string" ? body.supplierId : "";
  const number = typeof body?.number === "string" ? body.number.trim().slice(0, 80) || null : null;
  const totalText = String(body?.total ?? "").trim();
  const currency = typeof body?.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const issueDate = typeof body?.issueDate === "string" ? new Date(body.issueDate) : new Date(NaN);
  const dueDate = typeof body?.dueDate === "string" && body.dueDate ? new Date(body.dueDate) : null;
  if (!supplierId || !totalText || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(Number(totalText)) || Number(totalText) <= 0 || Number(totalText) > 999999999999 || Number.isNaN(issueDate.getTime()) || (dueDate && Number.isNaN(dueDate.getTime()))) {
    return NextResponse.json({ error: "Confirma o fornecedor, valor, moeda e datas da factura." }, { status: 400 });
  }
  const organizationId = current.membership.organizationId;
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId, archivedAt: null }, select: { id: true } });
  if (!supplier) return NextResponse.json({ error: "Fornecedor não encontrado nesta empresa." }, { status: 400 });
  const total = D(totalText);
  if (!total.isFinite() || total.lte(0)) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  const bill = await prisma.bill.create({ data: {
    organizationId, supplierId, number, total: total.toFixed(2), currency, issueDate, dueDate,
    notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null,
    status: "OPEN",
  }, include: { supplier: { select: { id: true, name: true } }, payments: true } });
  await audit({ action: "bill.created", userId: current.user.id, organizationId, entityType: "Bill", entityId: bill.id });
  return NextResponse.json({ bill }, { status: 201 });
}
