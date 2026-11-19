import { NextResponse } from "next/server";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { sendInvoiceEmail } from "@/lib/invoice-email";

export const runtime = "nodejs";
export const maxDuration = 30;

const MESSAGES = {
  NOT_FOUND: ["Factura não encontrada.", 404],
  NOT_SENDABLE: ["Só é possível enviar facturas já emitidas.", 409],
  NO_CLIENT_EMAIL: ["O cliente não tem e-mail definido.", 400],
  SMTP_NOT_CONFIGURED: ["O envio de e-mail não está configurado neste servidor.", 503],
  SEND_FAILED: ["Não foi possível enviar o e-mail. Tenta novamente dentro de instantes.", 502],
} as const;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:send"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para enviar facturas." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const organizationId = current.membership.organizationId;
  const result = await sendInvoiceEmail({ invoiceId: id, organizationId, userId: current.user.id, kind: "invoice_send" });
  if (!result.sent) {
    const [error, status] = MESSAGES[result.reason];
    return NextResponse.json({ error, code: result.reason }, { status });
  }
  await audit({ action: "invoice.sent", userId: current.user.id, organizationId, entityType: "Invoice", entityId: id });
  return NextResponse.json({ sent: true });
}
