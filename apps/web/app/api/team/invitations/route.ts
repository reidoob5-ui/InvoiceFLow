import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, canAssignRole, ForbiddenError, type Role, ROLES } from "@/lib/permissions";
import { withOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "team:read"); }
  catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para consultar a equipa." }, { status: 403 });
    throw error;
  }
  const organizationId = current.membership.organizationId;
  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    members: members.map((m) => ({ id: m.id, role: m.role, status: m.status, createdAt: m.createdAt, user: m.user })),
    invitations,
  });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "team:write"); }
  catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para gerir a equipa." }, { status: 403 });
    throw error;
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role as Role : "MEMBER";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return NextResponse.json({ error: "Introduz um e-mail válido." }, { status: 400 });
  if (!ROLES.includes(role) || !canAssignRole(current.membership.role as Role, role))
    return NextResponse.json({ error: "Não tens autorização para atribuir este perfil." }, { status: 403 });

  const organizationId = current.membership.organizationId;
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: existingUser.id, organizationId } },
      select: { id: true, status: true },
    });
    if (existingMembership?.status === "ACTIVE")
      return NextResponse.json({ error: "Este utilizador já pertence à equipa." }, { status: 409 });
  }
  const duplicate = await prisma.invitation.findFirst({
    where: { organizationId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Já existe um convite pendente para este e-mail." }, { status: 409 });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const execution = await withOrganizationPlanLimit(organizationId, "maxUsers", 1, (tx) => tx.invitation.create({
    data: { organizationId, email, role, tokenHash: hashToken(token), invitedById: current.user.id, expiresAt },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
  }));
  if (!execution.allowed) return NextResponse.json(planLimitResponse(execution.result), { status: 402 });
  const invitation = execution.value;
  await audit({
    action: "team.invitation_created", userId: current.user.id, organizationId,
    entityType: "Invitation", entityId: invitation.id, metadata: { email, role },
  });
  return NextResponse.json({
    invitation,
    inviteUrl: `${request.nextUrl.origin}/team/accept?token=${token}`,
    delivery: "MANUAL",
    notice: "O convite foi criado. Copia o link e envia-o ao membro; o envio automático de e-mail ainda não está configurado.",
  }, { status: 201 });
}
