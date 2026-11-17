import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/auth/tokens";
import { verifyTotp } from "@/lib/auth/totp";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";
  const user = await prisma.user.findUnique({ where: { id: current.user.id }, select: { twoFactorSecret: true } });
  if (!user?.twoFactorSecret || !verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
    return NextResponse.json({ error: "Código de autenticação inválido." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: current.user.id }, data: { twoFactorEnabled: true } });
  await audit({ action: "auth.2fa.enabled", userId: current.user.id, organizationId: current.membership?.organizationId });
  return NextResponse.json({ enabled: true });
}
