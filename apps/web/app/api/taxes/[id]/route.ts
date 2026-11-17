import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";
const kinds = ["VAT", "SALES_TAX", "WITHHOLDING", "OTHER"] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "taxes:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const organizationId = current.membership.organizationId;
  const existing = await prisma.taxRate.findFirst({ where: { id, organizationId } });
  if (!existing) return NextResponse.json({ error: "Taxa não encontrada." }, { status: 404 });

  const data: {
    name?: string; rate?: number; kind?: (typeof kinds)[number]; country?: string | null;
    region?: string | null; exempt?: boolean; isDefault?: boolean; active?: boolean;
  } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2) return NextResponse.json({ error: "O nome deve ter pelo menos 2 caracteres." }, { status: 400 });
    data.name = body.name.trim().slice(0, 80);
  }
  if (body.rate !== undefined) {
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return NextResponse.json({ error: "A taxa deve ser um número entre 0 e 100." }, { status: 400 });
    data.rate = rate;
  }
  if (body.kind !== undefined) {
    if (!kinds.includes(body.kind)) return NextResponse.json({ error: "Tipo de imposto inválido." }, { status: 400 });
    data.kind = body.kind;
  }
  if (body.country !== undefined) {
    const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : "";
    if (country && !/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "O país deve usar o código ISO de 2 letras." }, { status: 400 });
    data.country = country || null;
  }
  if (body.region !== undefined) data.region = typeof body.region === "string" ? body.region.trim().slice(0, 80) || null : null;
  if (body.exempt !== undefined) data.exempt = body.exempt === true;
  if (body.active !== undefined) data.active = body.active === true;
  if (body.isDefault !== undefined) data.isDefault = body.isDefault === true;

  const resultingExempt = data.exempt ?? existing.exempt;
  const wantsDefault = data.isDefault === true && data.active !== false && !resultingExempt;
  if (data.exempt === true || data.active === false) data.isDefault = false;
  const tax = await prisma.$transaction(async (tx) => {
    if (wantsDefault) await tx.taxRate.updateMany({ where: { organizationId, id: { not: id } }, data: { isDefault: false } });
    return tx.taxRate.update({
      where: { id },
      data,
      select: { id: true, name: true, rate: true, kind: true, country: true, region: true, exempt: true, isDefault: true, active: true, createdAt: true },
    });
  }, { isolationLevel: "Serializable" });
  await audit({ action: "tax_rate.updated", userId: current.user.id, organizationId, entityType: "TaxRate", entityId: id });
  return NextResponse.json({ tax });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "taxes:delete"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const result = await prisma.taxRate.updateMany({
    where: { id, organizationId },
    data: { active: false, isDefault: false },
  });
  if (result.count === 0) return NextResponse.json({ error: "Taxa não encontrada." }, { status: 404 });
  await audit({ action: "tax_rate.archived", userId: current.user.id, organizationId, entityType: "TaxRate", entityId: id });
  return NextResponse.json({ success: true });
}
