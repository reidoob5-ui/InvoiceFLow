import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { withOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "clients:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const archived = request.nextUrl.searchParams.get("archived") === "true";
  const clients = await prisma.client.findMany({
    where: {
      organizationId: current.membership.organizationId,
      archivedAt: archived ? { not: null } : null,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }, { taxId: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
    select: { id: true, type: true, name: true, company: true, email: true, phone: true, taxId: true, country: true, city: true, currency: true, createdAt: true },
  });
  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "clients:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 160) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (name.length < 2) return NextResponse.json({ error: "O nome deve ter pelo menos 2 caracteres." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  const execution = await withOrganizationPlanLimit(current.membership.organizationId, "maxClients", 1, (tx) => tx.client.create({
    data: {
      organizationId: current.membership.organizationId,
      type: body?.type === "INDIVIDUAL" ? "INDIVIDUAL" : "COMPANY",
      name, email: email || null,
      company: typeof body?.company === "string" ? body.company.trim().slice(0, 160) || null : null,
      phone: typeof body?.phone === "string" ? body.phone.trim().slice(0, 40) || null : null,
      taxId: typeof body?.taxId === "string" ? body.taxId.trim().slice(0, 80) || null : null,
      country: typeof body?.country === "string" ? body.country.trim().slice(0, 2).toUpperCase() || null : null,
      city: typeof body?.city === "string" ? body.city.trim().slice(0, 100) || null : null,
      addressLine1: typeof body?.addressLine1 === "string" ? body.addressLine1.trim().slice(0, 180) || null : null,
      currency: typeof body?.currency === "string" ? body.currency.trim().toUpperCase().slice(0, 3) || null : null,
      notes: typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null,
    },
    select: { id: true, type: true, name: true, company: true, email: true, phone: true, taxId: true, country: true, city: true, currency: true, createdAt: true },
  }));
  if (!execution.allowed) return NextResponse.json(planLimitResponse(execution.result), { status: 402 });
  const client = execution.value;
  await audit({ action: "client.created", userId: current.user.id, organizationId: current.membership.organizationId, entityType: "Client", entityId: client.id });
  return NextResponse.json({ client }, { status: 201 });
}
