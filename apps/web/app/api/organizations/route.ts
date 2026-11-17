import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const memberships = await prisma.membership.findMany({
    where: { userId: current.user.id, status: "ACTIVE", organization: { status: "ACTIVE" } },
    include: { organization: { select: { id: true, name: true, slug: true, currency: true, locale: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ organizations: memberships.map((m) => ({ ...m.organization, role: m.role })) });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (name.length < 2) return NextResponse.json({ error: "O nome da empresa deve ter pelo menos 2 caracteres." }, { status: 400 });
    const count = await prisma.membership.count({ where: { userId: current.user.id, status: "ACTIVE" } });
    if (count >= 10) return NextResponse.json({ error: "Limite inicial de 10 empresas atingido." }, { status: 403 });
    const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "empresa";
    const organization = await prisma.$transaction(async (tx) => {
      let slug = base;
      for (let attempt = 0; attempt < 5; attempt++) {
        const exists = await tx.organization.findUnique({ where: { slug }, select: { id: true } });
        if (!exists) break;
        slug = `${base}-${randomUUID().slice(0, 6)}`;
      }
      const org = await tx.organization.create({ data: { name, slug, memberships: { create: { userId: current.user.id, role: "OWNER" } } } });
      await tx.session.update({ where: { id: current.session.id }, data: { activeOrganizationId: org.id } });
      await tx.auditLog.create({ data: { action: "organization.created", userId: current.user.id, organizationId: org.id, entityType: "Organization", entityId: org.id } });
      return org;
    });
    return NextResponse.json({ organization: { id: organization.id, name: organization.name, slug: organization.slug } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível criar a empresa." }, { status: 500 });
  }
}
