import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const membership = await prisma.membership.findFirst({
    where: { userId: current.user.id, organizationId, status: "ACTIVE", organization: { status: "ACTIVE" } },
    select: { id: true, organizationId: true },
  });
  if (!membership) return NextResponse.json({ error: "Empresa não encontrada ou sem acesso." }, { status: 404 });
  await prisma.session.update({ where: { id: current.session.id }, data: { activeOrganizationId: membership.organizationId } });
  await audit({ action: "organization.switched", userId: current.user.id, organizationId: membership.organizationId });
  return NextResponse.json({ ok: true, activeOrganizationId: membership.organizationId });
}
