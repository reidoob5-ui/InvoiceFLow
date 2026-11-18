import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, checkPasswordStrength } from "@/lib/auth/password";
import { createSession, audit } from "@/lib/auth/session";
import { DEFAULT_PLANS } from "@/lib/plans";
import { checkOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const planKey = typeof body.planKey === "string" ? body.planKey : "";
    const inviteToken = typeof body.inviteToken === "string" ? body.inviteToken : "";
    const invitation = inviteToken
      ? await prisma.invitation.findUnique({ where: { tokenHash: hashToken(inviteToken) } })
      : null;

    if (inviteToken && (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()))
      return NextResponse.json({ error: "Este convite é inválido, já foi utilizado ou expirou." }, { status: 410 });
    if (invitation && invitation.email.toLowerCase() !== email)
      return NextResponse.json({ error: "Usa o e-mail para o qual o convite foi enviado." }, { status: 403 });
    if (!invitation && !DEFAULT_PLANS.some((plan) => plan.key === planKey))
      return NextResponse.json({ error: "Escolhe um plano antes de criar a conta." }, { status: 400 });
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return NextResponse.json({ error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
    const issues = checkPasswordStrength(password);
    if (issues.length) return NextResponse.json({ error: "A palavra-passe não cumpre os requisitos.", issues }, { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "Já existe uma conta com este e-mail. Entra na tua conta para aceitar o convite." }, { status: 409 });

    if (invitation) {
      const planLimit = await checkOrganizationPlanLimit(invitation.organizationId, "maxUsers", 0);
      if (!planLimit.allowed) return NextResponse.json(planLimitResponse(planLimit), { status: 402 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, passwordHash },
        select: { id: true, name: true, email: true },
      });
      if (invitation) {
        const fresh = await tx.invitation.findUnique({ where: { id: invitation.id } });
        if (!fresh || fresh.acceptedAt || fresh.expiresAt <= new Date()) throw new Error("INVITATION_ALREADY_USED");
        await tx.membership.create({
          data: { userId: created.id, organizationId: invitation.organizationId, role: invitation.role, status: "ACTIVE" },
        });
        await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      }
      return created;
    });

    await createSession(user.id, invitation?.organizationId ?? null);
    await audit({
      action: invitation ? "team.invitation_accepted" : "auth.register",
      userId: user.id,
      organizationId: invitation?.organizationId ?? null,
      entityType: invitation ? "Invitation" : "User",
      entityId: invitation ? invitation.id : user.id,
    });
    return NextResponse.json({ user, planKey: invitation ? null : planKey, acceptedInvitation: !!invitation }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_USED")
      return NextResponse.json({ error: "Este convite já foi utilizado." }, { status: 409 });
    console.error("[register]", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return NextResponse.json({ error: "Não foi possível concluir o registo." }, { status: 500 });
  }
}
