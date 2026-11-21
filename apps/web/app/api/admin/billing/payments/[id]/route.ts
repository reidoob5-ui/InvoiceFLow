import { NextResponse } from "next/server";
import { audit } from "@/lib/auth/session";
import { requirePlatformAdmin } from "@/lib/billing/admin-guard";
import { BillingAdminError, confirmManualPayment, notifyOrgOwner, rejectManualPayment } from "@/lib/billing/manual";

export const runtime = "nodejs";

/** Só o administrador da plataforma confirma ou rejeita um pagamento. Confirmar activa o plano. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const g = await requirePlatformAdmin(); if ("error" in g) return g.error;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown; note?: unknown; periodEnd?: unknown } | null;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  try {
    if (body?.action === "confirm") {
      let periodEnd: Date | undefined;
      if (typeof body.periodEnd === "string" && body.periodEnd) { periodEnd = new Date(body.periodEnd); if (Number.isNaN(periodEnd.getTime())) return NextResponse.json({ error: "Data inválida." }, { status: 400 }); }
      const r = await confirmManualPayment(id, g.current.user.id, { note, periodEnd });
      await audit({ organizationId: r.organizationId, userId: g.current.user.id, action: "billing.manual.confirmed", entityType: "PlatformInvoice", entityId: id, metadata: { reference: r.reference, amount: r.amount, periodEnd: r.periodEnd } });
      await notifyOrgOwner(r.organizationId, "Pagamento confirmado — InvoiceFlow", `O teu pagamento (ref. ${r.reference}) foi confirmado e o plano está activo até ${r.periodEnd.toLocaleDateString("pt-PT")}. Obrigado!`);
      return NextResponse.json({ ok: true, periodEnd: r.periodEnd });
    }
    if (body?.action === "reject") {
      if (note.length < 3) return NextResponse.json({ error: "Indica o motivo da rejeição." }, { status: 400 });
      const r = await rejectManualPayment(id, g.current.user.id, note);
      await audit({ organizationId: r.organizationId, userId: g.current.user.id, action: "billing.manual.rejected", entityType: "PlatformInvoice", entityId: id, metadata: { reference: r.reference, reason: note } });
      await notifyOrgOwner(r.organizationId, "Pagamento não confirmado — InvoiceFlow", `Não foi possível confirmar o pagamento (ref. ${r.reference}). Motivo: ${note}. Se já pagaste, envia novamente o comprovativo por WhatsApp.`);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acção inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof BillingAdminError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
