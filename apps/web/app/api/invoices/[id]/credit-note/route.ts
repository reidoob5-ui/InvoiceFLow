import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { retryOnConflict } from "@/lib/tx-retry";
import { createCreditNote } from "@/lib/document-workflow";
import { workflowErrorResponse } from "@/lib/workflow-http";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:send"); assertCan(current.membership.role, "invoices:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para emitir notas de crédito." }, { status: 403 });
    throw error;
  }
  const body = await request.json().catch(() => null) as { reason?: unknown; lines?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (reason.length < 3) return NextResponse.json({ error: "Indica o motivo da nota de crédito (mínimo 3 caracteres)." }, { status: 400 });

  let lines: Array<{ lineId: string; quantity: string }> | null = null;
  if (body?.lines !== undefined && body.lines !== null) {
    if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100) {
      return NextResponse.json({ error: "Linhas inválidas." }, { status: 400 });
    }
    lines = [];
    for (const raw of body.lines as Array<{ lineId?: unknown; quantity?: unknown }>) {
      const quantity = String(raw?.quantity ?? "").trim();
      if (typeof raw?.lineId !== "string" || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(quantity)) {
        return NextResponse.json({ error: "Linha ou quantidade inválida." }, { status: 400 });
      }
      lines.push({ lineId: raw.lineId, quantity });
    }
  }

  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  let result;
  try {
    result = await retryOnConflict(() => prisma.$transaction(
      (tx) => createCreditNote(tx, { invoiceId: id, organizationId, userId: current.user.id, reason, lines }),
      { isolationLevel: "Serializable" },
    ));
  } catch (error) { return workflowErrorResponse(error); }
  await audit({
    action: "invoice.credit_note_issued", userId: current.user.id, organizationId, entityType: "Invoice", entityId: id,
    metadata: { creditNoteId: result.creditNote.id, number: result.creditNote.number, reason },
  });
  return NextResponse.json(result, { status: 201 });
}
