import { prisma } from "@/lib/db";
import { DEFAULT_PLANS, hasActiveAccess, type LimitKey, type PlanLimits } from "@/lib/plans";

export type PlanLimitResult =
  | { allowed: true; planKey: string; planName: string; limit: number | null; used: number }
  | { allowed: false; code: "PLAN_LIMIT_REACHED" | "SUBSCRIPTION_INACTIVE"; planKey: string; planName: string; limit: number | null; used: number };

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

export async function checkOrganizationPlanLimit(
  organizationId: string,
  key: "maxUsers" | "maxClients" | "maxInvoicesPerMonth",
): Promise<PlanLimitResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: { select: { key: true, name: true, limits: true } } },
  });

  const fallback = DEFAULT_PLANS.find((plan) => plan.key === "free")!;
  const planKey = subscription?.plan.key ?? fallback.key;
  const planName = subscription?.plan.name ?? fallback.name;
  const limits = asLimits(subscription?.plan.limits, fallback.limits);
  let used = 0;

  if (key === "maxUsers") {
    used = await prisma.membership.count({ where: { organizationId, status: "ACTIVE" } });
  } else if (key === "maxClients") {
    used = await prisma.client.count({ where: { organizationId, archivedAt: null } });
  } else {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    used = await prisma.invoice.count({ where: { organizationId, createdAt: { gte: start, lt: next } } });
  }

  const limit = limits[key];
  if (subscription && !hasActiveAccess(subscription)) {
    return { allowed: false, code: "SUBSCRIPTION_INACTIVE", planKey, planName, limit, used };
  }
  if (limit !== null && used >= limit) {
    return { allowed: false, code: "PLAN_LIMIT_REACHED", planKey, planName, limit, used };
  }
  return { allowed: true, planKey, planName, limit, used };
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
