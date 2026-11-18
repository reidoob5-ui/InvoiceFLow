import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { checkOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Inicia sessão com o e-mail convidado para aceitar o convite." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token || token.length > 200) return NextResponse.json({ error: "Convite inválido." }, { status: 400 });

  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date())
    return NextResponse.json({ error: "Este convite é inválido, já foi utilizado ou expirou." }, { status: 410 });
  if (invitation.email.toLowerCase() !== current.user.email.toLowerCase())
    return NextResponse.json({ error: "Entra com a conta cujo e-mail recebeu este convite." }, { status: 403 });

  const planLimit = await checkOrganizationPlanLimit(invitation.organizationId, "maxUsers", 0);
  if (!planLimit.allowed) return NextResponse.json(planLimitResponse(planLimit), { status: 402 });

  try {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.invitation.findUnique({ where: { id: invitation.id } });
      if (!fresh || fresh.acceptedAt || fresh.expiresAt <= new Date()) throw new Error("INVITATION_ALREADY_USED");
      await tx.membership.upsert({
        where: { userId_organizationId: { userId: current.user.id, organizationId: invitation.organizationId } },
        update: { role: invitation.role, status: "ACTIVE" },
        create: { userId: current.user.id, organizationId: invitation.organizationId, role: invitation.role, status: "ACTIVE" },
      });
      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await tx.session.update({ where: { id: current.session.id }, data: { activeOrganizationId: invitation.organizationId } });
    });
    await audit({
      action: "team.invitation_accepted", userId: current.user.id, organizationId: invitation.organizationId,
      entityType: "Invitation", entityId: invitation.id,
    });
    return NextResponse.json({ accepted: true, organizationId: invitation.organizationId });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_USED")
      return NextResponse.json({ error: "Este convite já foi utilizado." }, { status: 409 });
    console.error("[team invitation accept]", error);
    return NextResponse.json({ error: "Não foi possível aceitar o convite." }, { status: 500 });
  }
}
