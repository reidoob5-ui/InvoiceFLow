import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_PLANS, hasActiveAccess, type LimitKey, type PlanLimits } from "@/lib/plans";

export type PlanLimitResult =
  | { allowed: true; planKey: string; planName: string; limit: number | null; used: number }
  | { allowed: false; code: "PLAN_LIMIT_REACHED" | "SUBSCRIPTION_INACTIVE"; planKey: string; planName: string; limit: number | null; used: number };

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

function asLimits(value: unknown, fallback: PlanLimits): PlanLimits {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const keys: LimitKey[] = ["maxUsers", "maxClients", "maxInvoicesPerMonth", "maxOrganizations", "aiMessagesPerMonth"];
  return Object.fromEntries(keys.map((key) => {
    const candidate = raw[key];
    return [key, candidate === null || (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0)
      ? candidate : fallback[key]];
  })) as PlanLimits;
}

async function checkLimit(
  db: DatabaseClient,
  organizationId: string,
  key: "maxUsers" | "maxClients" | "maxInvoicesPerMonth",
  adding: number,
): Promise<PlanLimitResult> {
  const subscription = await db.subscription.findUnique({
    where: { organizationId },
    include: { plan: { select: { key: true, name: true, limits: true } } },
  });

  const fallback = DEFAULT_PLANS.find((plan) => plan.key === "free")!;
  const planKey = subscription?.plan.key ?? fallback.key;
  const planName = subscription?.plan.name ?? fallback.name;
  const limits = asLimits(subscription?.plan.limits, fallback.limits);
  let used = 0;

  if (key === "maxUsers") {
    const [activeMembers, pendingInvitations] = await Promise.all([
      db.membership.count({ where: { organizationId, status: "ACTIVE" } }),
      db.invitation.count({ where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    used = activeMembers + pendingInvitations;
  } else if (key === "maxClients") {
    used = await db.client.count({ where: { organizationId, archivedAt: null } });
  } else {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    used = await db.invoice.count({ where: { organizationId, createdAt: { gte: start, lt: next } } });
  }

  const limit = limits[key];
  if (subscription && !hasActiveAccess(subscription)) {
    return { allowed: false, code: "SUBSCRIPTION_INACTIVE", planKey, planName, limit, used };
  }
  if (limit !== null && used + adding > limit) {
    return { allowed: false, code: "PLAN_LIMIT_REACHED", planKey, planName, limit, used };
  }
  return { allowed: true, planKey, planName, limit, used };
}

export function checkOrganizationPlanLimit(
  organizationId: string,
  key: "maxUsers" | "maxClients" | "maxInvoicesPerMonth",
  adding = 1,
) {
  return checkLimit(prisma, organizationId, key, adding);
}

export type PlanLimitExecution<T> =
  | { allowed: true; value: T }
  | { allowed: false; result: Exclude<PlanLimitResult, { allowed: true }> };

/**
 * Serializes plan-limited writes per organization/resource. The transaction-scoped
 * PostgreSQL advisory lock is held until the write commits or rolls back.
 * Every write path for a given limit must use this helper to share the lock.
 */
export function withOrganizationPlanLimit<T>(
  organizationId: string,
  key: "maxUsers" | "maxClients" | "maxInvoicesPerMonth",
  adding: number,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<PlanLimitExecution<T>> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${key}))`;
    const checked = await checkLimit(tx, organizationId, key, adding);
    if (!checked.allowed) return { allowed: false as const, result: checked };
    const value = await operation(tx);
    return { allowed: true as const, value };
  });
}

export function planLimitResponse(result: Exclude<PlanLimitResult, { allowed: true }>) {
  if (result.code === "SUBSCRIPTION_INACTIVE") {
    return {
      error: "A subscrição não está activa. Consulta a área de facturação para continuares.",
      code: result.code,
      plan: result.planName,
    };
  }
  return {
    error: `Atingiste o limite do plano ${result.planName}.`,
    code: result.code,
    plan: result.planName,
    limit: result.limit,
    used: result.used,
  };
}
