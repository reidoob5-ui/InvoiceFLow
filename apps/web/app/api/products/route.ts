import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "products:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0,100) ?? "";
  const archived = request.nextUrl.searchParams.get("archived") === "true";
  const products = await prisma.product.findMany({
    where: { organizationId: current.membership.organizationId, archivedAt: archived ? { not: null } : null,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } : {}) },
    orderBy: { name: "asc" }, take: 200,
    select: { id: true, type: true, name: true, sku: true, description: true, unitPrice: true, costPrice: true, taxRate: true, currency: true, trackStock: true, stockQty: true, lowStockThreshold: true, createdAt: true },
  });
  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "products:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0,160) : "";
  const unitPrice = Number(body?.unitPrice);
  const costPrice = body?.costPrice === undefined || body.costPrice === "" ? 0 : Number(body.costPrice);
  const taxRate = body?.taxRate === undefined || body.taxRate === "" ? 0 : Number(body.taxRate);
  if (name.length < 2 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(costPrice) || costPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)
    return NextResponse.json({ error: "Nome, preço e imposto inválidos." }, { status: 400 });
  const sku = typeof body?.sku === "string" ? body.sku.trim().slice(0,80) || null : null;
  if (sku) {
    const duplicate = await prisma.product.findFirst({ where: { organizationId: current.membership.organizationId, sku }, select: { id: true } });
    if (duplicate) return NextResponse.json({ error: "Já existe um produto com este SKU." }, { status: 409 });
  }
  const product = await prisma.product.create({ data: {
    organizationId: current.membership.organizationId, name,
    type: body?.type === "SERVICE" ? "SERVICE" : "PRODUCT",
    sku, description: typeof body?.description === "string" ? body.description.trim().slice(0,1000) || null : null,
    unitPrice, costPrice, taxRate, currency: typeof body?.currency === "string" ? body.currency.toUpperCase().slice(0,3) : current.membership.organization.currency,
    trackStock: body?.trackStock === true,
    stockQty: body?.stockQty === undefined || body?.stockQty === "" ? 0 : Number(body.stockQty),
    lowStockThreshold: body?.lowStockThreshold === undefined || body?.lowStockThreshold === "" ? 0 : Number(body.lowStockThreshold),
  }, select: { id: true, type: true, name: true, sku: true, description: true, unitPrice: true, costPrice: true, taxRate: true, currency: true, trackStock: true, stockQty: true, lowStockThreshold: true, createdAt: true } });
  await audit({ action: "product.created", userId: current.user.id, organizationId: current.membership.organizationId, entityType: "Product", entityId: product.id });
  return NextResponse.json({ product }, { status: 201 });
}
