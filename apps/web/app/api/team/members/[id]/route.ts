import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, canAssignRole, ForbiddenError, type Role, ROLES } from "@/lib/permissions";
import { checkOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "team:write"); }
  catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para gerir a equipa." }, { status: 403 });
    throw error;
  }

  const { id } = await context.params;
  const target = await prisma.membership.findFirst({
    where: { id, organizationId: current.membership.organizationId },
    select: { id: true, userId: true, role: true, status: true },
  });
  if (!target) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
  if (target.userId === current.user.id)
    return NextResponse.json({ error: "Não podes alterar o teu próprio acesso nesta página." }, { status: 409 });
  if (target.role === "OWNER" && current.membership.role !== "OWNER")
    return NextResponse.json({ error: "Apenas um proprietário pode gerir o acesso de outro proprietário." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const data: { role?: Role; status?: "ACTIVE" | "SUSPENDED" } = {};
  if (typeof body?.role === "string") {
    const role = body.role as Role;
    if (!ROLES.includes(role) || !canAssignRole(current.membership.role as Role, role))
      return NextResponse.json({ error: "Não tens autorização para atribuir este perfil." }, { status: 403 });
    data.role = role;
  }
  if (body?.status === "ACTIVE" || body?.status === "SUSPENDED") data.status = body.status;
  if (!data.role && !data.status) return NextResponse.json({ error: "Nenhuma alteração válida foi indicada." }, { status: 400 });

  if (target.status === "SUSPENDED" && data.status === "ACTIVE") {
    const planLimit = await checkOrganizationPlanLimit(current.membership.organizationId, "maxUsers");
    if (!planLimit.allowed) return NextResponse.json(planLimitResponse(planLimit), { status: 402 });
  }

  const removingOwner = target.role === "OWNER" && ((data.role && data.role !== "OWNER") || data.status === "SUSPENDED");
  if (removingOwner) {
    const otherOwners = await prisma.membership.count({
      where: { organizationId: current.membership.organizationId, role: "OWNER", status: "ACTIVE", id: { not: target.id } },
    });
    if (otherOwners === 0)
      return NextResponse.json({ error: "A empresa precisa de manter pelo menos um proprietário activo." }, { status: 409 });
  }

  const updated = await prisma.membership.update({
    where: { id: target.id },
    data,
    select: { id: true, role: true, status: true, user: { select: { id: true, name: true, email: true } } },
  });
  await audit({
    action: "team.member_updated", userId: current.user.id, organizationId: current.membership.organizationId,
    entityType: "Membership", entityId: target.id, metadata: data,
  });
  return NextResponse.json({ member: updated });
}
