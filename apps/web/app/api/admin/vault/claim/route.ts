import { NextResponse } from "next/server";
import { claimAdminAccess } from "@/lib/admin/vault";

export const runtime = "nodejs";

/** Primeiro acesso por link de uso único: escolhe a senha do admin sem passar pela senha da conta. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; email?: unknown; password?: unknown; confirm?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.slice(0, 200) : "";
  const email = typeof body?.email === "string" ? body.email.slice(0, 200) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  if (!token || !email || !password) return NextResponse.json({ error: "Preenche todos os campos." }, { status: 400 });
  if (password !== body?.confirm) return NextResponse.json({ error: "As duas senhas não coincidem." }, { status: 400 });
  const r = await claimAdminAccess({ token, email, password });
  if (r.kind === "error") return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json({ ok: true });
}
