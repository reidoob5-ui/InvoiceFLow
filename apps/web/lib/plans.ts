export type PlanLimits = {
  /** null = unlimited */
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
  trialDays: number;
  limits: PlanLimits;
  features: string[];
  sortOrder: number;
};

// Default catalogue. Prices are placeholders to be set by the platform owner in the admin panel.
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    key: "free", name: "Free", description: "Freelancers e iniciantes", monthlyPrice: 0, yearlyPrice: 0, trialDays: 0, sortOrder: 0,
    limits: { maxUsers: 1, maxClients: 10, maxInvoicesPerMonth: 5, maxOrganizations: 1, aiMessagesPerMonth: 10 },
    features: ["invoices", "clients", "pdf"],
  },
  {
    key: "starter", name: "Starter", description: "Pequenos negócios", monthlyPrice: 9, yearlyPrice: 90, trialDays: 14, sortOrder: 1,
    limits: { maxUsers: 2, maxClients: 100, maxInvoicesPerMonth: 50, maxOrganizations: 1, aiMessagesPerMonth: 100 },
    features: ["invoices", "clients", "pdf", "expenses", "quotes", "reports", "email"],
  },
  {
    key: "professional", name: "Professional", description: "Empresas em crescimento", monthlyPrice: 29, yearlyPrice: 290, trialDays: 14, sortOrder: 2,
    limits: { maxUsers: 5, maxClients: 1000, maxInvoicesPerMonth: 500, maxOrganizations: 3, aiMessagesPerMonth: 500 },
    features: ["invoices", "clients", "pdf", "expenses", "quotes", "reports", "email", "recurring", "multi_currency", "ai", "api"],
  },
  {
    key: "business", name: "Business", description: "Empresas com equipas", monthlyPrice: 79, yearlyPrice: 790, trialDays: 14, sortOrder: 3,
    limits: { maxUsers: 25, maxClients: null, maxInvoicesPerMonth: null, maxOrganizations: 10, aiMessagesPerMonth: 2500 },
    features: ["invoices", "clients", "pdf", "expenses", "quotes", "reports", "email", "recurring", "multi_currency", "ai", "api", "webhooks", "audit"],
  },
  {
    key: "enterprise", name: "Enterprise", description: "Grandes organizações", monthlyPrice: 0, yearlyPrice: 0, trialDays: 30, sortOrder: 4,
    limits: { maxUsers: null, maxClients: null, maxInvoicesPerMonth: null, maxOrganizations: null, aiMessagesPerMonth: null },
    features: ["invoices", "clients", "pdf", "expenses", "quotes", "reports", "email", "recurring", "multi_currency", "ai", "api", "webhooks", "audit", "dedicated", "sso"],
  },
];

export type LimitKey = keyof PlanLimits;

export type LimitCheck = { allowed: true; remaining: number | null } | { allowed: false; limit: number; used: number };

/** Pure limit check; callers load `used` from the database. `null` limit means unlimited. */
export function checkLimit(limits: PlanLimits, key: LimitKey, used: number, adding = 1): LimitCheck {
  const limit = limits[key];
  if (limit === null || limit === undefined) return { allowed: true, remaining: null };
  if (used + adding > limit) return { allowed: false, limit, used };
  return { allowed: true, remaining: limit - used - adding };
}

export type SubscriptionState = {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  graceEndsAt?: Date | null;
};

/** Whether the organization may use paid features right now (trial, paid period or grace period). */
export function hasActiveAccess(sub: SubscriptionState, now = new Date()): boolean {
  switch (sub.status) {
    case "ACTIVE":
      return true;
    case "TRIALING":
      return !sub.trialEndsAt || sub.trialEndsAt.getTime() > now.getTime();
    case "PAST_DUE":
      return !!sub.graceEndsAt && sub.graceEndsAt.getTime() > now.getTime();
    case "CANCELED":
      // Canceled at period end keeps access until the period ends.
      return !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime();
    default:
      return false;
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
