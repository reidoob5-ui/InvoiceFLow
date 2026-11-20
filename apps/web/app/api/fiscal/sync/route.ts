import { NextResponse } from "next/server";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { FiscalError, syncOrganization } from "@/lib/agt/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Envio manual: submete pendentes à AGT e consulta o resultado dos pedidos aceites. */
export async function POST() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "fiscal:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const organizationId = current.membership.organizationId;
  try {
    const result = await syncOrganization(organizationId);
    await audit({ organizationId, userId: current.user.id, action: "fiscal.sync", entityType: "FiscalProfile", metadata: result });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof FiscalError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    return NextResponse.json({ error: "Falha ao contactar a AGT." }, { status: 502 });
  }
}
