import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret } from "@/lib/auth/tokens";
import { verifyTotp } from "@/lib/auth/totp";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code : "";
  const user = await prisma.user.findUnique({ where: { id: current.user.id } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash)) ||
      !user.twoFactorSecret || !verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
    return NextResponse.json({ error: "Confirmação inválida." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  await audit({ action: "auth.2fa.disabled", userId: user.id, organizationId: current.membership?.organizationId });
  return NextResponse.json({ enabled: false });
}
