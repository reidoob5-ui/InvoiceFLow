import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { formatDocumentNumber, sequenceKey } from "@/lib/numbering";
import { addDays } from "@/lib/invoice-calc";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:send"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para emitir." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const invoice = await prisma.$transaction(async (tx) => {
    const draft = await tx.invoice.findFirst({ where: { id, organizationId }, include: { lines: true, organization: true } });
    if (!draft) return null;
    if (draft.status !== "DRAFT") throw new Error("NOT_DRAFT");
    if (!draft.lines.length || Number(draft.total) <= 0) throw new Error("EMPTY_INVOICE");
    const now = new Date();
    const year = now.getUTCFullYear();
    const key = sequenceKey("invoice", year);
    const sequence = await tx.numberSequence.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, next: 2 },
      update: { next: { increment: 1 } },
    });
    const allocated = sequence.next - 1;
    const number = formatDocumentNumber(draft.organization.invoicePrefix, year, allocated);
    const dueDate = addDays(now, draft.paymentTermsDays);
    return tx.invoice.update({
      where: { id },
      data: { number, status: "ISSUED", issueDate: now, dueDate, events: { create: { userId: current.user.id, action: "issued", data: { number } } } },
      select: { id: true, number: true, status: true, issueDate: true, dueDate: true, total: true, currency: true },
    });
  }, { isolationLevel: "Serializable" }).catch((error) => {
    if (error instanceof Error && error.message === "NOT_DRAFT") return "NOT_DRAFT" as const;
    if (error instanceof Error && error.message === "EMPTY_INVOICE") return "EMPTY_INVOICE" as const;
    throw error;
  });
  if (!invoice) return NextResponse.json({ error: "Factura não encontrada." }, { status: 404 });
  if (invoice === "NOT_DRAFT") return NextResponse.json({ error: "Esta factura já foi emitida ou não está em rascunho." }, { status: 409 });
  if (invoice === "EMPTY_INVOICE") return NextResponse.json({ error: "A factura precisa de linhas e total superior a zero." }, { status: 400 });
  await audit({ action: "invoice.issued", userId: current.user.id, organizationId, entityType: "Invoice", entityId: id, metadata: { number: invoice.number } });
  return NextResponse.json({ invoice });
}
