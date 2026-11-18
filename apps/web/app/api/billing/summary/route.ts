import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { DEFAULT_PLANS, hasActiveAccess, type PlanLimits } from "@/lib/plans";

export const runtime = "nodejs";

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try {
    assertCan(current.membership.role, "billing:read");
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para consultar a facturação." }, { status: 403 });
    throw error;
  }

  const organizationId = current.membership.organizationId;
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });
  const fallback = DEFAULT_PLANS.find((plan) => plan.key === "free")!;
  const limits = (subscription?.plan.limits ?? fallback.limits) as PlanLimits;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [activeUsers, pendingInvitations, clients, invoices] = await Promise.all([
    prisma.membership.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.invitation.count({ where: { organizationId, acceptedAt: null, expiresAt: { gt: now } } }),
    prisma.client.count({ where: { organizationId, archivedAt: null } }),
    prisma.invoice.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
  ]);

  return NextResponse.json({
    plan: {
      key: subscription?.plan.key ?? fallback.key,
      name: subscription?.plan.name ?? fallback.name,
      monthlyPrice: subscription?.plan.monthlyPrice ?? fallback.monthlyPrice,
      yearlyPrice: subscription?.plan.yearlyPrice ?? fallback.yearlyPrice,
      currency: subscription?.plan.currency ?? fallback.currency,
      features: subscription?.plan.features ?? fallback.features,
      limits,
    },
    subscription: subscription ? {
      status: subscription.status,
      interval: subscription.interval,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      hasAccess: hasActiveAccess(subscription, now),
    } : { status: "ACTIVE", interval: "MONTHLY", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, hasAccess: true },
    usage: { users: activeUsers + pendingInvitations, activeUsers, pendingInvitations, clients, invoices },
    billingProviderConfigured: false,
  });
}
