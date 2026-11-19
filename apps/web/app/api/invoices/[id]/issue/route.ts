import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { retryOnConflict } from "@/lib/tx-retry";
import { issueDraftInvoice } from "@/lib/document-workflow";
import { workflowErrorResponse } from "@/lib/workflow-http";

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
  let invoice;
  try {
    invoice = await retryOnConflict(() => prisma.$transaction(
      (tx) => issueDraftInvoice(tx, { invoiceId: id, organizationId, userId: current.user.id }),
      { isolationLevel: "Serializable" },
    ));
  } catch (error) { return workflowErrorResponse(error); }
  await audit({ action: "invoice.issued", userId: current.user.id, organizationId, entityType: "Invoice", entityId: id, metadata: { number: invoice.number } });
  return NextResponse.json({ invoice });
}
