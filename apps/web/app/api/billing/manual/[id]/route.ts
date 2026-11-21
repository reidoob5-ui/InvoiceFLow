import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";

async function guard() {
  const current = await getCurrentSession();
  if (!current) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  if (!current.membership) return { error: NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 }) } as const;
  try { assertCan(current.membership.role, "billing:write"); } catch (error) {
    if (error instanceof ForbiddenError) return { error: NextResponse.json({ error: "Apenas o proprietário pode alterar a subscrição." }, { status: 403 }) } as const;
    throw error;
  }
  return { current } as const;
}

/** O cliente avisa que já pagou e enviou o comprovativo. Isto NÃO activa o plano; só põe o pedido na fila do administrador. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const g = await guard(); if ("error" in g) return g.error;
  const { id } = await context.params;
  const organizationId = g.current.membership!.organizationId;
  const body = await request.json().catch(() => null) as { note?: unknown } | null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : null;
  const done = await prisma.platformInvoice.updateMany({ where: { id, organizationId, provider: "manual", status: "OPEN", claimedAt: null }, data: { claimedAt: new Date(), customerNote: note || null } });
  if (done.count !== 1) return NextResponse.json({ error: "Pedido não encontrado ou já enviado." }, { status: 409 });
  await audit({ organizationId, userId: g.current.user.id, action: "billing.manual.claimed", entityType: "PlatformInvoice", entityId: id }).catch(() => {});
  return NextResponse.json({ ok: true });
}

/** Cancela um pedido que ainda não foi enviado para análise. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const g = await guard(); if ("error" in g) return g.error;
  const { id } = await context.params;
  const organizationId = g.current.membership!.organizationId;
  const done = await prisma.platformInvoice.updateMany({ where: { id, organizationId, provider: "manual", status: "OPEN", claimedAt: null }, data: { status: "VOID", reviewedAt: new Date(), reviewNote: "Cancelado pelo cliente." } });
  if (done.count !== 1) return NextResponse.json({ error: "Só podes cancelar pedidos ainda não enviados." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
