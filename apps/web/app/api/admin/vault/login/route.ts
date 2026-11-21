import { NextResponse } from "next/server";
import { attemptAdminLogin } from "@/lib/admin/vault";

export const runtime = "nodejs";

/** Entrada na administração com email + senha do admin. Não revela se o email é de um administrador. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.slice(0, 200) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !password) return NextResponse.json({ error: "Indica o email e a senha." }, { status: 400 });
  const r = await attemptAdminLogin({ email, password, code });
  switch (r.kind) {
    case "ok": return NextResponse.json({ ok: true });
    case "code_required": return NextResponse.json({ error: "Indica o código de autenticação.", code: "CODE_REQUIRED" }, { status: 401 });
    case "locked": return NextResponse.json({ error: `Demasiadas tentativas. Tenta novamente em ${Math.ceil(r.retryAfterSec / 60)} min.`, code: "LOCKED", retryAfterSec: r.retryAfterSec }, { status: 429, headers: { "retry-after": String(r.retryAfterSec) } });
    case "needs_setup": return NextResponse.json({ error: "Ainda não definiste a senha do admin. Entra primeiro na tua conta normal e depois abre /admin.", code: "NEEDS_SETUP" }, { status: 409 });
    default: return NextResponse.json({ error: "Email ou senha incorrectos." }, { status: 401 });
  }
}
