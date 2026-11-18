import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { formatDocumentNumber, sequenceKey } from "@/lib/numbering";
import { retryOnConflict } from "@/lib/tx-retry";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "quotes:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const quote = await prisma.quote.findFirst({ where: { id, organizationId: current.membership.organizationId }, include: {
    client: true, lines: { orderBy: { position: "asc" } }, events: { orderBy: { createdAt: "desc" } },
  } });
  if (!quote) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PATCH(request: NextRequest, context: Context) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "quotes:send"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para alterar o estado deste orçamento." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const nextStatus = body?.status;
  if (!["SENT", "ACCEPTED", "REJECTED", "EXPIRED"].includes(nextStatus)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  const organizationId = current.membership.organizationId;
  const result = await retryOnConflict(() => prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({ where: { id, organizationId }, include: { organization: { select: { quotePrefix: true } } } });
    if (!quote) return { error: "NOT_FOUND" as const };
    const transitions: Record<string, string[]> = {
      DRAFT: ["SENT"], SENT: ["ACCEPTED", "REJECTED", "EXPIRED"], ACCEPTED: [], REJECTED: [], EXPIRED: [], CONVERTED: [],
    };
    if (!transitions[quote.status]?.includes(nextStatus)) return { error: "INVALID_TRANSITION" as const };
    if (nextStatus === "ACCEPTED" && quote.validUntil && quote.validUntil < new Date()) return { error: "EXPIRED" as const };
    let number = quote.number;
    if (nextStatus === "SENT" && !number) {
      const year = new Date().getUTCFullYear();
      const key = sequenceKey("quote", year);
      const sequence = await tx.numberSequence.upsert({
        where: { organizationId_key: { organizationId, key } },
        create: { organizationId, key, next: 2 },
        update: { next: { increment: 1 } },
      });
      number = formatDocumentNumber(quote.organization.quotePrefix, year, sequence.next - 1);
    }
    const updated = await tx.quote.update({
      where: { id },
      data: { status: nextStatus, number, ...(nextStatus === "ACCEPTED" || nextStatus === "REJECTED" ? { respondedAt: new Date() } : {}),
        events: { create: { userId: current.user.id, action: nextStatus.toLowerCase() } } },
      select: { id: true, number: true, status: true, respondedAt: true, updatedAt: true },
    });
    return { quote: updated };
  }, { isolationLevel: "Serializable" }));
  if ("error" in result) {
    if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
    if (result.error === "EXPIRED") return NextResponse.json({ error: "Este orçamento já ultrapassou a validade." }, { status: 409 });
    return NextResponse.json({ error: "Transição de estado não permitida." }, { status: 409 });
  }
  await audit({ action: "quote.status_changed", userId: current.user.id, organizationId, entityType: "Quote", entityId: id, metadata: { status: nextStatus } });
  return NextResponse.json(result);
}
