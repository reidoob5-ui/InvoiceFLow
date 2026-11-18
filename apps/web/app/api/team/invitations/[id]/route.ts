import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "team:write"); }
  catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para gerir convites." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const invitation = await prisma.invitation.findFirst({
    where: { id, organizationId: current.membership.organizationId, acceptedAt: null },
    select: { id: true, email: true },
  });
  if (!invitation) return NextResponse.json({ error: "Convite pendente não encontrado." }, { status: 404 });
  await prisma.invitation.delete({ where: { id: invitation.id } });
  await audit({
    action: "team.invitation_revoked", userId: current.user.id, organizationId: current.membership.organizationId,
    entityType: "Invitation", entityId: invitation.id, metadata: { email: invitation.email },
  });
  return NextResponse.json({ revoked: true });
}
