import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";

/** Só administradores da plataforma (isPlatformAdmin). Devolve a sessão ou a resposta de erro. */
export async function requirePlatformAdmin() {
  const current = await getCurrentSession();
  if (!current) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  if (!current.user.isPlatformAdmin) return { error: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) } as const;
  return { current } as const;
}
