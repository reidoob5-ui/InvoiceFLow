export type PlanLimits = {
  maxUsers: number | null;
  maxClients: number | null;
  maxInvoicesPerMonth: number | null;
  maxOrganizations: number | null;
  aiMessagesPerMonth: number | null;
};

export type PlanSeed = {
  key: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: "AOA";
  trialDays: number;
  limits: PlanLimits;
  features: string[];
  sortOrder: number;
};

export const DEFAULT_PLANS: PlanSeed[] = [
  {
    key: "free",
    name: "Gratuito",
    description: "Para começar a organizar o teu negócio",
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: "AOA",
    trialDays: 0,
    sortOrder: 0,
    limits: { maxUsers: 1, maxClients: 10, maxInvoicesPerMonth: 5, maxOrganizations: 1, aiMessagesPerMonth: 0 },
    features: ["invoices", "clients", "pdf"],
  },
  {
    key: "pro",
    name: "Pro",
    description: "Para negócios em crescimento",
    monthlyPrice: 19000,
    yearlyPrice: 228000,
    currency: "AOA",
    trialDays: 14,
    sortOrder: 1,
    limits: { maxUsers: 2, maxClients: 100, maxInvoicesPerMonth: 50, maxOrganizations: 1, aiMessagesPerMonth: 100 },
    features: ["invoices", "clients", "pdf", "products", "suppliers", "taxes", "csv", "payments"],
  },
  {
    key: "business",
    name: "Business",
    description: "Para equipas e operações maiores",
    monthlyPrice: 32000,
    yearlyPrice: 384000,
    currency: "AOA",
    trialDays: 14,
    sortOrder: 2,
    limits: { maxUsers: 5, maxClients: 1000, maxInvoicesPerMonth: 500, maxOrganizations: 3, aiMessagesPerMonth: 500 },
    features: ["invoices", "clients", "pdf", "products", "suppliers", "taxes", "csv", "payments", "multi_currency", "audit"],
  },
];

export type LimitKey = keyof PlanLimits;
export type LimitCheck = { allowed: true; remaining: number | null } | { allowed: false; limit: number; used: number };

export function checkLimit(limits: PlanLimits, key: LimitKey, used: number, adding = 1): LimitCheck {
  const limit = limits[key];
  if (limit === null || limit === undefined) return { allowed: true, remaining: null };
  if (used + adding > limit) return { allowed: false, limit, used };
  return { allowed: true, remaining: limit - used - adding };
}

export type SubscriptionState = {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELED" | "EXPIRED";
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  graceEndsAt?: Date | null;
};

export function hasActiveAccess(sub: SubscriptionState, now = new Date()): boolean {
  switch (sub.status) {
    case "ACTIVE": return !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > now.getTime();
    case "TRIALING": return !sub.trialEndsAt || sub.trialEndsAt.getTime() > now.getTime();
    case "PAST_DUE": return !!sub.graceEndsAt && sub.graceEndsAt.getTime() > now.getTime();
    case "CANCELED": return !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime();
    default: return false;
  }
}

export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function applyCoupon(price: number, coupon: { percentOff?: number | null; amountOff?: number | null }): number {
  let out = price;
  if (coupon.percentOff) out = out * (1 - Math.min(100, Math.max(0, coupon.percentOff)) / 100);
  if (coupon.amountOff) out = out - coupon.amountOff;
  return Math.max(0, Math.round(out * 100) / 100);
}
