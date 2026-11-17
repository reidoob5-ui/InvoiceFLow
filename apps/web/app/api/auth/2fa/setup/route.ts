import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/auth/tokens";
import { generateTotpSecret, otpauthUrl } from "@/lib/auth/totp";

export const runtime = "nodejs";

export async function POST() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: current.user.id }, data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false } });
  return NextResponse.json({ secret, otpauthUrl: otpauthUrl(secret, current.user.email) });
}
