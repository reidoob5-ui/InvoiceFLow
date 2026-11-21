import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/billing/admin-guard";
import { attemptUnlock } from "@/lib/admin/vault";

export const runtime = "nodejs";

/** Abre o cofre da administração: senha única do admin + código 2FA. */
export async function POST(request: Request) {
  const g = await requirePlatformAdmin({ unlocked: false }); if ("error" in g) return g.error;
  const body = await request.json().catch(() => null) as { password?: unknown; code?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!password) return NextResponse.json({ error: "Indica a senha do admin." }, { status: 400 });
  const r = await attemptUnlock({ sessionId: g.current.session.id, userId: g.current.user.id, email: g.current.user.email, password, code });
  switch (r.kind) {
    case "ok": return NextResponse.json({ ok: true });
    case "locked": return NextResponse.json({ error: `Demasiadas tentativas. Tenta novamente em ${Math.ceil(r.retryAfterSec / 60)} min.`, code: "LOCKED", retryAfterSec: r.retryAfterSec }, { status: 429, headers: { "retry-after": String(r.retryAfterSec) } });
    case "needs_setup": return NextResponse.json({ error: "Ainda não definiste a senha do admin.", code: "NEEDS_SETUP" }, { status: 409 });
    case "needs_2fa": return NextResponse.json({ error: "Activa primeiro a autenticação em duas etapas.", code: "NEEDS_2FA" }, { status: 409 });
    default: return NextResponse.json({ error: "Senha ou código incorrectos." }, { status: 401 });
  }
}
