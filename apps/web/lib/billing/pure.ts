import { randomBytes } from "node:crypto";
import { hasActiveAccess, type SubscriptionState } from "@/lib/plans";

// Funções puras do faturação manual (sem base de dados), para poderem ser testadas isoladamente.

/** Fim do período: mesmo dia do mês seguinte (ou ano), sem ultrapassar o último dia do mês. */
export function addPeriod(start: Date, interval: "MONTHLY" | "YEARLY"): Date {
  const day = start.getUTCDate();
  const end = new Date(Date.UTC(start.getUTCFullYear() + (interval === "YEARLY" ? 1 : 0), start.getUTCMonth() + (interval === "MONTHLY" ? 1 : 0), 1,
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newReference(): string {
  const bytes = randomBytes(6);
  return "IF-" + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function whatsappLink(number: string, text: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export type PayState = "NO_PLAN" | "FREE" | "PAID" | "EXPIRING" | "TRIAL" | "GRACE" | "SUSPENDED" | "CANCELING" | "UNPAID";

/**
 * Estado "real" para o administrador: quem está pago, quem está a expirar e quem NÃO pagou.
 * Usa a mesma regra de acesso que bloqueia o cliente (hasActiveAccess), por isso o painel nunca mostra "pago"
 * a alguém que o servidor já bloqueou.
 */
export function classifySubscription(
  sub: { status: SubscriptionState["status"]; trialEndsAt?: Date | null; currentPeriodEnd?: Date | null; graceEndsAt?: Date | null } | null,
  planMonthlyPrice: number, now = new Date(),
): PayState {
  if (!sub) return "NO_PLAN";
  if (sub.status === "PAUSED") return "SUSPENDED";
  const access = hasActiveAccess(sub, now);
  if (planMonthlyPrice <= 0 && access && sub.status === "ACTIVE") return "FREE";
  if (!access) return "UNPAID";
  if (sub.status === "TRIALING") return "TRIAL";
  if (sub.status === "PAST_DUE") return "GRACE";
  if (sub.status === "CANCELED") return "CANCELING";
  const days = sub.currentPeriodEnd ? (sub.currentPeriodEnd.getTime() - now.getTime()) / 86400_000 : Infinity;
  return days <= 7 ? "EXPIRING" : "PAID";
}

