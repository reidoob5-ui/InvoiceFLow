// Regras puras do cofre de administração (sem base de dados), para poderem ser testadas isoladamente.

export const ADMIN_IDLE_MS = 15 * 60_000;      // fecha sozinho após 15 min sem actividade
export const ADMIN_MAX_MS = 2 * 60 * 60_000;   // e nunca fica aberto mais de 2 horas seguidas

export type UnlockFields = { adminUnlockedAt?: Date | null; adminLastSeenAt?: Date | null };

export function unlockState(s: UnlockFields, now = new Date()): "locked" | "unlocked" {
  if (!s.adminUnlockedAt) return "locked";
  const t = now.getTime();
  if (t - s.adminUnlockedAt.getTime() >= ADMIN_MAX_MS) return "locked";
  const last = (s.adminLastSeenAt ?? s.adminUnlockedAt).getTime();
  return t - last >= ADMIN_IDLE_MS ? "locked" : "unlocked";
}

/** Lista de IPs permitidos (ADMIN_ALLOWED_IPS, separados por vírgula). Vazia = sem restrição. */
export function ipAllowed(ip: string | null, allowList: string | undefined): boolean {
  const list = (allowList ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return !!ip && list.includes(ip);
}

/**
 * Bloqueio progressivo contra adivinhação da senha do admin.
 * 5 falhas em 15 min bloqueiam 15 min; 10 falhas em 24 h bloqueiam 60 min (contado a partir da última falha).
 * Devolve quantos ms faltam para poder tentar de novo (0 = pode tentar).
 */
export function lockoutRemainingMs(failures: Date[], now = new Date()): number {
  const times = failures.map((d) => d.getTime()).sort((a, b) => b - a);
  if (times.length === 0) return 0;
  const t = now.getTime();
  const last15 = times.filter((x) => t - x < 15 * 60_000).length;
  const last24h = times.filter((x) => t - x < 24 * 3600_000).length;
  let until = 0;
  if (last15 >= 5) until = Math.max(until, times[0] + 15 * 60_000);
  if (last24h >= 10) until = Math.max(until, times[0] + 60 * 60_000);
  return Math.max(0, until - t);
}

export type AdminPasswordIssue = "too_short" | "too_common" | "needs_variety" | "contains_email";
const COMMON = ["password", "senha", "123456", "qwerty", "invoiceflow", "angola", "admin"];

/** A senha do admin é uma frase longa: mínimo 14 caracteres e variedade (ou 20+ caracteres). */
export function adminPasswordIssues(password: string, email: string): AdminPasswordIssue[] {
  const issues: AdminPasswordIssue[] = [];
  if (password.length < 14) issues.push("too_short");
  const lower = password.toLowerCase();
  if (COMMON.some((w) => lower === w || (password.length < 20 && lower.includes(w)))) issues.push("too_common");
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 3 && lower.includes(local)) issues.push("contains_email");
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length < 20 && classes < 3) issues.push("needs_variety");
  return issues;
}

export const ISSUE_TEXT: Record<AdminPasswordIssue, string> = {
  too_short: "Usa pelo menos 14 caracteres.",
  too_common: "Evita palavras comuns como “password”, “admin” ou “invoiceflow”.",
  needs_variety: "Mistura maiúsculas, minúsculas, números e símbolos (ou usa uma frase com 20+ caracteres).",
  contains_email: "Não uses parte do teu email na senha.",
};
