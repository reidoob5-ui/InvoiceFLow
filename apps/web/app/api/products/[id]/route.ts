import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "products:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0,160) : "";
  const unitPrice = Number(body?.unitPrice), costPrice = Number(body?.costPrice ?? 0), taxRate = Number(body?.taxRate ?? 0);
  if (name.length < 2 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(costPrice) || costPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)
    return NextResponse.json({ error: "Nome, preço e imposto inválidos." }, { status: 400 });
  const existing = await prisma.product.findFirst({ where: { id, organizationId: current.membership.organizationId, archivedAt: null }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  const product = await prisma.product.update({ where: { id }, data: {
    name, type: body?.type === "SERVICE" ? "SERVICE" : "PRODUCT",
    sku: typeof body?.sku === "string" ? body.sku.trim().slice(0,80) || null : null,
    description: typeof body?.description === "string" ? body.description.trim().slice(0,1000) || null : null,
    unitPrice, costPrice, taxRate,
    currency: typeof body?.currency === "string" ? body.currency.toUpperCase().slice(0,3) : current.membership.organization.currency,
    trackStock: body?.trackStock === true, stockQty: Number(body?.stockQty ?? 0), lowStockThreshold: Number(body?.lowStockThreshold ?? 0),
  }, select: { id: true, type: true, name: true, sku: true, description: true, unitPrice: true, costPrice: true, taxRate: true, currency: true, trackStock: true, stockQty: true, lowStockThreshold: true, createdAt: true } });
  await audit({ action: "product.updated", userId: current.user.id, organizationId: current.membership.organizationId, entityType: "Product", entityId: id });
  return NextResponse.json({ product });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "products:delete"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const result = await prisma.product.updateMany({ where: { id, organizationId: current.membership.organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (!result.count) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  await audit({ action: "product.archived", userId: current.user.id, organizationId: current.membership.organizationId, entityType: "Product", entityId: id });
  return NextResponse.json({ archived: true });
}
