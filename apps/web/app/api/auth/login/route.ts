import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret } from "@/lib/auth/tokens";
import { verifyTotp } from "@/lib/auth/totp";
import { createSession, audit } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!email || !password) return NextResponse.json({ error: "E-mail e palavra-passe são obrigatórios." }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid || user.status !== "ACTIVE") {
      if (user) {
        const failures = user.failedLogins + 1;
        await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failures, lockedUntil: failures >= 8 ? new Date(Date.now() + 15 * 60_000) : null } });
      }
      return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
    }
    if (user.lockedUntil && user.lockedUntil > new Date())
      return NextResponse.json({ error: "Conta temporariamente bloqueada. Tente novamente mais tarde." }, { status: 423 });
    if (user.twoFactorEnabled && (!user.twoFactorSecret || !code || !verifyTotp(decryptSecret(user.twoFactorSecret), code)))
      return NextResponse.json({ error: "Código de autenticação inválido." }, { status: 401 });
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" }, select: { organizationId: true },
    });
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await createSession(user.id, membership?.organizationId);
    await audit({ action: "auth.login", userId: user.id, organizationId: membership?.organizationId ?? null });
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, activeOrganizationId: membership?.organizationId ?? null });
  } catch {
    return NextResponse.json({ error: "Não foi possível iniciar sessão." }, { status: 500 });
  }
}
