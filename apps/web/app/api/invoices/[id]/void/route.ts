import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { retryOnConflict } from "@/lib/tx-retry";
import { voidIssuedInvoice } from "@/lib/document-workflow";
import { workflowErrorResponse } from "@/lib/workflow-http";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:delete"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para anular facturas." }, { status: 403 });
    throw error;
  }
  const body = await request.json().catch(() => null) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (reason.length < 3) return NextResponse.json({ error: "Indica o motivo da anulação (mínimo 3 caracteres)." }, { status: 400 });
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  let result;
  try {
    result = await retryOnConflict(() => prisma.$transaction(
      (tx) => voidIssuedInvoice(tx, { invoiceId: id, organizationId, userId: current.user.id, reason }),
      { isolationLevel: "Serializable" },
    ));
  } catch (error) { return workflowErrorResponse(error); }
  await audit({ action: "invoice.voided", userId: current.user.id, organizationId, entityType: "Invoice", entityId: id, metadata: { reason } });
  return NextResponse.json({ invoice: result });
}
