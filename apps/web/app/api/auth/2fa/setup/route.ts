import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "@/lib/auth/tokens";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/auth/totp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  // Com o 2FA já activo, gerar um novo segredo exige um código válido; senão quem roubasse a sessão desligava o 2FA.
  const existing = await prisma.user.findUnique({ where: { id: current.user.id }, select: { twoFactorEnabled: true, twoFactorSecret: true } });
  if (existing?.twoFactorEnabled) {
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";
    if (!existing.twoFactorSecret || !verifyTotp(decryptSecret(existing.twoFactorSecret), code)) return NextResponse.json({ error: "O 2FA já está activo. Indica um código válido para o reconfigurar." }, { status: 403 });
  }
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: current.user.id }, data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false } });
  return NextResponse.json({ secret, otpauthUrl: otpauthUrl(secret, current.user.email) });
}
