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
  try { assertCan(current.membership.role, "clients:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 160) : "";
  if (name.length < 2) return NextResponse.json({ error: "O nome deve ter pelo menos 2 caracteres." }, { status: 400 });
  const existing = await prisma.client.findFirst({ where: { id, organizationId: current.membership.organizationId, archivedAt: null }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  const client = await prisma.client.update({ where: { id }, data: {
    name, email: email || null,
    type: body?.type === "INDIVIDUAL" ? "INDIVIDUAL" : "COMPANY",
    company: typeof body?.company === "string" ? body.company.trim().slice(0,160) || null : null,
    phone: typeof body?.phone === "string" ? body.phone.trim().slice(0,40) || null : null,
    taxId: typeof body?.taxId === "string" ? body.taxId.trim().slice(0,80) || null : null,
    country: typeof body?.country === "string" ? body.country.trim().slice(0,2).toUpperCase() || null : null,
    city: typeof body?.city === "string" ? body.city.trim().slice(0,100) || null : null,
    addressLine1: typeof body?.addressLine1 === "string" ? body.addressLine1.trim().slice(0,180) || null : null,
    currency: typeof body?.currency === "string" ? body.currency.trim().toUpperCase().slice(0,3) || null : null,
    notes: typeof body?.notes === "string" ? body.notes.trim().slice(0,2000) || null : null,
  }, select: { id: true, type: true, name: true, company: true, email: true, phone: true, taxId: true, country: true, city: true, currency: true, createdAt: true } });
  await audit({ action: "client.updated", userId: current.user.id, organizationId: current.membership.organizationId, entityType: "Client", entityId: id });
  return NextResponse.json({ client });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "clients:delete"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const result = await prisma.client.updateMany({ where: { id, organizationId: current.membership.organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (!result.count) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  await audit({ action: "client.archived", userId: current.user.id, organizationId: current.membership.organizationId, entityType: "Client", entityId: id });
  return NextResponse.json({ archived: true });
}
