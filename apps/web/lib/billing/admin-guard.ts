import { NextResponse } from "next/server";
import { getClientIp, getCurrentSession } from "@/lib/auth/session";
import { ipAllowed, unlockState } from "@/lib/admin/vault-pure";
import { touchAdmin } from "@/lib/admin/vault";

/**
 * Só administradores da plataforma, e só com o cofre de administração aberto (senha própria + 2FA).
 * Quem não é administrador (ou vem de um IP não permitido) recebe 404, como se a rota não existisse.
 * `{ unlocked: false }` é só para as rotas que abrem/configuram o próprio cofre.
 */
export async function requirePlatformAdmin(opts: { unlocked?: boolean } = {}) {
  const current = await getCurrentSession();
  if (!current) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  if (!current.user.isPlatformAdmin || !ipAllowed(await getClientIp(), process.env.ADMIN_ALLOWED_IPS)) {
    return { error: NextResponse.json({ error: "Não encontrado." }, { status: 404 }) } as const;
  }
  if (opts.unlocked !== false) {
    if (unlockState(current.session) !== "unlocked") return { error: NextResponse.json({ error: "Área de administração bloqueada.", code: "ADMIN_LOCKED" }, { status: 423 }) } as const;
    await touchAdmin(current.session.id);
  }
  return { current } as const;
}
