import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret } from "@/lib/auth/tokens";
import { verifyTotp } from "@/lib/auth/totp";
import { createSession, audit, getClientIp } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!email || !password) return NextResponse.json({ error: "E-mail e palavra-passe são obrigatórios." }, { status: 400 });
    // Limite por IP: 20 falhas em 15 minutos (protege contra tentativas em muitas contas diferentes).
    const ip = await getClientIp();
    if (ip) {
      const recentFailures = await prisma.auditLog.count({ where: { action: "auth.login_failed", ip, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
      if (recentFailures >= 20) return NextResponse.json({ error: "Demasiadas tentativas. Tente novamente dentro de alguns minutos." }, { status: 429 });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    // Conta bloqueada: recusa antes de verificar a palavra-passe (não confirma se a palavra-passe estava certa).
    if (user?.lockedUntil && user.lockedUntil > new Date())
      return NextResponse.json({ error: "Conta temporariamente bloqueada. Tente novamente mais tarde." }, { status: 423 });
    // Cada falha (palavra-passe ou código 2FA) conta para o bloqueio: 8 falhas = 15 minutos.
    const registerFailure = async () => {
      await audit({ action: "auth.login_failed", userId: user?.id ?? null });
      if (!user) return;
      const updated = await prisma.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } });
      if (updated.failedLogins >= 8)
        await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: new Date(Date.now() + 15 * 60_000) } });
    };
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid || user.status !== "ACTIVE") {
      await registerFailure();
      return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
    }
    if (user.twoFactorEnabled) {
      if (!code) return NextResponse.json({ error: "Introduza o código de autenticação." }, { status: 401 });
      if (!user.twoFactorSecret || !verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
        await registerFailure();
        return NextResponse.json({ error: "Código de autenticação inválido." }, { status: 401 });
      }
    }
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" }, select: { organizationId: true },
    });
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await createSession(user.id, membership?.organizationId);
    await audit({ action: "auth.login", userId: user.id, organizationId: membership?.organizationId ?? null });
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email }, activeOrganizationId: membership?.organizationId ?? null });
  } catch (error) {
    console.error("[login]", error instanceof Error ? `${error.name}: ${error.message}` : error);
    return NextResponse.json({ error: "Não foi possível iniciar sessão." }, { status: 500 });
  }
}
