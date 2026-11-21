import { createHash, timingSafeEqual } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit, createSession, getClientIp, getCurrentSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { decryptSecret } from "@/lib/auth/tokens";
import { verifyTotp } from "@/lib/auth/totp";
import { adminPasswordIssues, ipAllowed, ISSUE_TEXT, lockoutRemainingMs, unlockState } from "@/lib/admin/vault-pure";

const KEY = "admin_access_hash";
/** O 2FA do cofre é opcional: só é exigido se ADMIN_REQUIRE_2FA=1 (ou se a própria conta já tiver 2FA activo). */
export const require2fa = () => process.env.ADMIN_REQUIRE_2FA === "1";

/** A senha do admin vem de ADMIN_ACCESS_HASH (se definida: só se muda na Vercel) ou da base de dados. */
export async function getAdminHash(): Promise<{ hash: string | null; source: "env" | "db" | null }> {
  const env = process.env.ADMIN_ACCESS_HASH?.trim();
  if (env) return { hash: env, source: "env" };
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  return row?.value ? { hash: row.value, source: "db" } : { hash: null, source: null };
}

export async function touchAdmin(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { adminLastSeenAt: new Date() } });
}

export async function lockAdminSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) }, data: { adminUnlockedAt: null, adminLastSeenAt: null } });
}

/**
 * Porta das páginas de administração. Quem não é administrador (ou vem de um IP não permitido) recebe um 404 normal,
 * como se a área não existisse. Quem é administrador mas ainda não abriu o cofre vai para /admin/unlock.
 */
export async function gateAdminPage(mode: "unlocked" | "any") {
  const current = await getCurrentSession();
  if (!current) redirect("/admin/unlock");
  if (!current.user.isPlatformAdmin || !ipAllowed(await getClientIp(), process.env.ADMIN_ALLOWED_IPS)) notFound();
  const open = unlockState(current.session) === "unlocked";
  if (mode === "unlocked") {
    if (!open) redirect("/admin/unlock");
    await touchAdmin(current.session.id);
  }
  return { current, open };
}

export type UnlockResult =
  | { kind: "ok" } | { kind: "invalid" } | { kind: "locked"; retryAfterSec: number }
  | { kind: "needs_setup" } | { kind: "needs_2fa" };

async function twoFactorOk(userId: string, code: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorSecret: true } });
  if (!u?.twoFactorEnabled || !u.twoFactorSecret) return { enabled: false, valid: false };
  return { enabled: true, valid: /^\d{6}$/.test(code) && verifyTotp(decryptSecret(u.twoFactorSecret), code) };
}

async function failures(userId: string | null, ip: string | null) {
  const rows = await prisma.auditLog.findMany({
    where: { action: "admin.unlock_failed", createdAt: { gte: new Date(Date.now() - 24 * 3600_000) }, OR: [...(userId ? [{ userId }] : []), ...(ip ? [{ ip }] : [])] },
    orderBy: { createdAt: "desc" }, take: 30, select: { createdAt: true },
  });
  return rows.map((r) => r.createdAt);
}

export async function attemptUnlock(input: { sessionId: string; userId: string; email: string; password: string; code: string }): Promise<UnlockResult> {
  const ip = await getClientIp();
  const wait = lockoutRemainingMs(await failures(input.userId, ip));
  if (wait > 0) return { kind: "locked", retryAfterSec: Math.ceil(wait / 1000) };
  const { hash } = await getAdminHash();
  if (!hash) return { kind: "needs_setup" };
  const tf = await twoFactorOk(input.userId, input.code);
  if (require2fa() && !tf.enabled) return { kind: "needs_2fa" };
  // As duas verificações correm sempre, para não revelar qual falhou.
  const passwordOk = await verifyPassword(input.password, hash);
  const codeOk = tf.enabled ? tf.valid : true;
  if (!passwordOk || !codeOk) {
    await audit({ action: "admin.unlock_failed", userId: input.userId, metadata: { reason: !passwordOk ? "password" : "code" } });
    return { kind: "invalid" };
  }
  const now = new Date();
  await prisma.session.update({ where: { id: input.sessionId }, data: { adminUnlockedAt: now, adminLastSeenAt: now } });
  await audit({ action: "admin.unlocked", userId: input.userId });
  void alertAdmin(input.email, ip);
  return { kind: "ok" };
}

async function alertAdmin(email: string, ip: string | null) {
  try {
    const { sendMail } = await import("@/lib/mailer");
    await sendMail({ to: email, subject: "Acesso à administração InvoiceFlow", text: `A administração foi desbloqueada em ${new Date().toLocaleString("pt-PT", { timeZone: "Africa/Luanda" })} (IP ${ip ?? "desconhecido"}). Se não foste tu, muda já as palavras-passe e activa a restrição por IP.` });
  } catch { /* alerta é best-effort */ }
}

export type SetupResult = { kind: "ok" } | { kind: "error"; message: string; status: number };

/** Define (ou muda) a senha do admin. Mudar exige a senha actual; ambas as operações exigem o código 2FA. */
export async function setAdminPassword(input: { sessionId: string; userId: string; email: string; newPassword: string; code: string; currentPassword?: string }): Promise<SetupResult> {
  const err = (message: string, status = 400): SetupResult => ({ kind: "error", message, status });
  const ip = await getClientIp();
  const wait = lockoutRemainingMs(await failures(input.userId, ip));
  if (wait > 0) return err("Demasiadas tentativas. Tenta mais tarde.", 429);
  const existing = await getAdminHash();
  if (existing.source === "env") return err("A senha do admin está definida na Vercel (ADMIN_ACCESS_HASH) e só pode ser mudada lá.", 409);
  const tf = await twoFactorOk(input.userId, input.code);
  if (require2fa() && !tf.enabled) return err("Activa primeiro a autenticação em duas etapas.", 409);
  if (tf.enabled && !tf.valid) { await audit({ action: "admin.unlock_failed", userId: input.userId, metadata: { reason: "setup_code" } }); return err("Código de autenticação inválido."); }
  if (existing.hash) {
    if (!input.currentPassword || !(await verifyPassword(input.currentPassword, existing.hash))) { await audit({ action: "admin.unlock_failed", userId: input.userId, metadata: { reason: "setup_current" } }); return err("Senha actual do admin incorrecta."); }
  }
  const issues = adminPasswordIssues(input.newPassword, input.email);
  if (issues.length) return err(issues.map((i) => ISSUE_TEXT[i]).join(" "), 422);
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { passwordHash: true } });
  if (user?.passwordHash && (await verifyPassword(input.newPassword, user.passwordHash))) return err("A senha do admin tem de ser diferente da senha da tua conta.", 422);
  const value = await hashPassword(input.newPassword);
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  await lockAdminSessions(input.userId);
  const now = new Date();
  await prisma.session.update({ where: { id: input.sessionId }, data: { adminUnlockedAt: now, adminLastSeenAt: now } });
  await audit({ action: existing.hash ? "admin.password_changed" : "admin.password_set", userId: input.userId });
  return { kind: "ok" };
}

export type LoginResult = UnlockResult | { kind: "code_required" };

/**
 * Entrada directa na administração com email + senha do admin (um só passo, sem a senha da conta).
 * Para quem não é administrador responde exactamente como para uma senha errada e gasta o mesmo tempo.
 */
export async function attemptAdminLogin(input: { email: string; password: string; code: string }): Promise<LoginResult> {
  const ip = await getClientIp();
  const email = input.email.trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true, isPlatformAdmin: true, twoFactorEnabled: true, twoFactorSecret: true } }) : null;
  const wait = lockoutRemainingMs(await failures(user?.id ?? null, ip));
  if (wait > 0) return { kind: "locked", retryAfterSec: Math.ceil(wait / 1000) };
  const { hash } = await getAdminHash();
  if (!hash) return { kind: "needs_setup" };
  const passwordOk = await verifyPassword(input.password, hash);
  const isAdmin = !!user && user.status === "ACTIVE" && user.isPlatformAdmin && ipAllowed(ip, process.env.ADMIN_ALLOWED_IPS);
  if (!passwordOk || !isAdmin || !user) {
    await audit({ action: "admin.unlock_failed", userId: user?.id ?? null, metadata: { reason: !passwordOk ? "password" : "not_admin", direct: true } });
    return { kind: "invalid" };
  }
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!input.code) return { kind: "code_required" };
    if (!/^\d{6}$/.test(input.code) || !verifyTotp(decryptSecret(user.twoFactorSecret), input.code)) {
      await audit({ action: "admin.unlock_failed", userId: user.id, metadata: { reason: "code", direct: true } });
      return { kind: "invalid" };
    }
  }
  const membership = await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } }, orderBy: { createdAt: "asc" }, select: { organizationId: true } });
  const sessionId = await createSession(user.id, membership?.organizationId);
  const now = new Date();
  await prisma.session.update({ where: { id: sessionId }, data: { adminUnlockedAt: now, adminLastSeenAt: now } });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  await audit({ action: "admin.login", userId: user.id });
  void alertAdmin(user.email, ip);
  return { kind: "ok" };
}

const SETUP_KEY = "admin_setup_token";

export type ClaimResult = { kind: "ok" } | { kind: "error"; message: string; status: number };

/**
 * Primeiro acesso por link de uso único (sem precisar da senha da conta): o token (guardado só como hash, com validade)
 * é criado por quem gere o servidor. Quem o tiver escolhe o email de administrador e a sua senha do admin.
 * O token é apagado ao ser usado.
 */
export async function claimAdminAccess(input: { token: string; email: string; password: string }): Promise<ClaimResult> {
  const generic: ClaimResult = { kind: "error", message: "Link inválido ou expirado.", status: 401 };
  const ip = await getClientIp();
  const email = input.email.trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true, isPlatformAdmin: true, passwordHash: true } }) : null;
  if (lockoutRemainingMs(await failures(user?.id ?? null, ip)) > 0) return { kind: "error", message: "Demasiadas tentativas. Tenta mais tarde.", status: 429 };
  const row = await prisma.platformSetting.findUnique({ where: { key: SETUP_KEY } });
  const [hashHex, expiresRaw] = (row?.value ?? "").split("|");
  const given = createHash("sha256").update(input.token).digest();
  const stored = hashHex && /^[0-9a-f]{64}$/.test(hashHex) ? Buffer.from(hashHex, "hex") : Buffer.alloc(32);
  const tokenOk = !!row && timingSafeEqual(given, stored) && Number(expiresRaw) > Date.now();
  const isAdmin = !!user && user.status === "ACTIVE" && user.isPlatformAdmin && ipAllowed(ip, process.env.ADMIN_ALLOWED_IPS);
  if (!tokenOk || !isAdmin || !user) {
    await audit({ action: "admin.unlock_failed", userId: user?.id ?? null, metadata: { reason: "claim" } });
    return generic;
  }
  if ((await getAdminHash()).source === "env") return { kind: "error", message: "A senha do admin está definida na Vercel (ADMIN_ACCESS_HASH).", status: 409 };
  const issues = adminPasswordIssues(input.password, user.email);
  if (issues.length) return { kind: "error", message: issues.map((i) => ISSUE_TEXT[i]).join(" "), status: 422 };
  if (user.passwordHash && (await verifyPassword(input.password, user.passwordHash))) return { kind: "error", message: "A senha do admin tem de ser diferente da senha da tua conta.", status: 422 };
  const value = await hashPassword(input.password);
  // Consome o token e grava a senha de forma atómica: o link só funciona uma vez.
  const consumed = await prisma.platformSetting.deleteMany({ where: { key: SETUP_KEY, value: row!.value } });
  if (consumed.count !== 1) return generic;
  await prisma.platformSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  const membership = await prisma.membership.findFirst({ where: { userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } }, orderBy: { createdAt: "asc" }, select: { organizationId: true } });
  const sessionId = await createSession(user.id, membership?.organizationId);
  const now = new Date();
  await prisma.session.update({ where: { id: sessionId }, data: { adminUnlockedAt: now, adminLastSeenAt: now } });
  await audit({ action: "admin.password_set", userId: user.id, metadata: { via: "setup_link" } });
  return { kind: "ok" };
}
