import { NextResponse } from "next/server";
import { audit } from "@/lib/auth/session";
import { requirePlatformAdmin } from "@/lib/billing/admin-guard";
import { adminSubscriptionAction, BillingAdminError, type SubscriptionAction } from "@/lib/billing/manual";

export const runtime = "nodejs";

/** Acções manuais do administrador sobre a subscrição de uma empresa: estender, suspender, reactivar, mudar plano. */
export async function POST(request: Request, context: { params: Promise<{ orgId: string }> }) {
  const g = await requirePlatformAdmin(); if ("error" in g) return g.error;
  const { orgId } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown; days?: unknown; planKey?: unknown } | null;
  let input: SubscriptionAction;
  switch (body?.action) {
    case "suspend": input = { action: "suspend" }; break;
    case "extend": input = { action: "extend", days: Number(body.days) }; break;
    case "reactivate": input = { action: "reactivate", days: Number(body.days) }; break;
    case "setPlan": input = { action: "setPlan", planKey: typeof body.planKey === "string" ? body.planKey : "" }; break;
    default: return NextResponse.json({ error: "Acção inválida." }, { status: 400 });
  }
  try {
    await adminSubscriptionAction(orgId, input);
    await audit({ organizationId: orgId, userId: g.current.user.id, action: `billing.admin.${input.action}`, entityType: "Subscription", entityId: orgId, metadata: input as unknown as Record<string, unknown> });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BillingAdminError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
