import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/billing/admin-guard";
import { lockAdminSessions } from "@/lib/admin/vault";
import { audit } from "@/lib/auth/session";

export const runtime = "nodejs";

/** Fecha o cofre em todas as sessões deste administrador. */
export async function POST() {
  const g = await requirePlatformAdmin({ unlocked: false }); if ("error" in g) return g.error;
  await lockAdminSessions(g.current.user.id);
  await audit({ action: "admin.locked", userId: g.current.user.id });
  return NextResponse.json({ ok: true });
}
