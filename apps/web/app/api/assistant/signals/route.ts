import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, can, ForbiddenError } from "@/lib/permissions";
import { computeSignals } from "@/lib/ai/signals";

export const runtime = "nodejs";
export const maxDuration = 20;

/** Alertas proactivos para o assistente flutuante (regras sobre os dados reais; não gasta quota de IA). */
export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "ai:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { organizationId, organization, role } = current.membership;
  const signals = await computeSignals(organizationId, role, organization.currency || "AOA");
  return NextResponse.json({ signals, canChat: can(role, "ai:write") }, { headers: { "cache-control": "no-store" } });
}
