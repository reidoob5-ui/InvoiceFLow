import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/billing/admin-guard";
import { setAdminPassword } from "@/lib/admin/vault";

export const runtime = "nodejs";

/** Define a senha do admin (primeira vez) ou muda-a (exige a senha actual). Ambas exigem o código 2FA. */
export async function POST(request: Request) {
  const g = await requirePlatformAdmin({ unlocked: false }); if ("error" in g) return g.error;
  const body = await request.json().catch(() => null) as { password?: unknown; confirm?: unknown; code?: unknown; currentPassword?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!password || password !== body?.confirm) return NextResponse.json({ error: "As duas senhas não coincidem." }, { status: 400 });
  const r = await setAdminPassword({ sessionId: g.current.session.id, userId: g.current.user.id, email: g.current.user.email, newPassword: password,
    code: typeof body?.code === "string" ? body.code.trim() : "", currentPassword: typeof body?.currentPassword === "string" ? body.currentPassword : undefined });
  if (r.kind === "error") return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json({ ok: true });
}
