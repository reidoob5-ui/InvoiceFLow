import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { paddlePriceId, verifyPaddleWebhook } from "@/lib/payments/paddle";

export const runtime = "nodejs";

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function nextPeriod(interval: "MONTHLY" | "YEARLY", from = new Date()) {
  const year = from.getUTCFullYear() + (interval === "YEARLY" ? 1 : 0);
  const month = from.getUTCMonth() + (interval === "MONTHLY" ? 1 : 0);
  const day = from.getUTCDate();
  const end = new Date(Date.UTC(year, month, 1, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

function dateOrNull(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Paddle webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  if (!verifyPaddleWebhook(rawBody, request.headers.get("paddle-signature"), secret)) {
    return NextResponse.json({ error: "Assinatura Paddle inválida." }, { status: 401 });
  }

  let event: {
    event_id?: string;
    event_type?: string;
    occurred_at?: string;
    data?: Record<string, unknown>;
  };
  try { event = JSON.parse(rawBody) as typeof event; } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  const occurredAt = dateOrNull(event.occurred_at);
  if (!event.event_id || !event.event_type || !event.data || !occurredAt) {
    return NextResponse.json({ error: "Evento Paddle incompleto ou sem data válida." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.providerWebhookEvent.create({
        data: { provider: "paddle", eventId: event.event_id! },
      });

      const data = event.data!;
      if (event.event_type === "transaction.completed") {
        if (data.status !== "completed" || typeof data.subscription_id !== "string") return;
        const custom = record(data.custom_data);
        const existing = await tx.subscription.findFirst({
          where: { provider: "paddle", providerRef: data.subscription_id },
          include: { plan: true },
        });
        // Paddle delivers notifications at least once and may deliver them out of order.
        if (existing?.providerEventAt && existing.providerEventAt > occurredAt) return;

        const organizationId = typeof custom.organizationId === "string" ? custom.organizationId : existing?.organizationId;
        const planKey = typeof custom.planKey === "string" ? custom.planKey : existing?.plan.key;
        const interval = custom.interval === "YEARLY" || existing?.interval === "YEARLY" ? "YEARLY" : "MONTHLY";
        if (!organizationId || !planKey) throw new Error("Paddle transaction has no matching InvoiceFlow organization/plan.");

        const expectedPrice = paddlePriceId(planKey, interval);
        const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
        // Checkout must contain exactly one configured subscription seat.
        const matchesExpectedCart = Boolean(expectedPrice) && items.length === 1 && items.every((item) => {
          const price = record(item.price);
          return (price.id ?? item.price_id) === expectedPrice && item.quantity === 1;
        });
        if (!matchesExpectedCart) throw new Error("Paddle transaction contents do not match the configured plan and quantity.");

        const plan = await tx.plan.findFirst({ where: { key: planKey, isPublic: true } });
        if (!plan) throw new Error("Paddle plan no longer exists.");
        const billingPeriod = record(data.billing_period);
        const periodEnd = dateOrNull(billingPeriod.ends_at) ?? nextPeriod(interval, occurredAt);

        await tx.subscription.upsert({
          where: { organizationId },
          update: {
            planId: plan.id,
            status: "ACTIVE",
            interval,
            trialEndsAt: null,
            currentPeriodEnd: periodEnd,
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            provider: "paddle",
            providerRef: data.subscription_id,
            providerEventAt: occurredAt,
          },
          create: {
            organizationId,
            planId: plan.id,
            status: "ACTIVE",
            interval,
            currentPeriodEnd: periodEnd,
            provider: "paddle",
            providerRef: data.subscription_id,
            providerEventAt: occurredAt,
          },
        });
      } else if (
        (event.event_type === "subscription.canceled" || event.event_type === "subscription.updated") &&
        typeof data.id === "string"
      ) {
        const existing = await tx.subscription.findFirst({
          where: { provider: "paddle", providerRef: data.id },
        });
        if (!existing || (existing.providerEventAt && existing.providerEventAt > occurredAt)) return;

        const status = data.status;
        const currentPeriod = record(data.current_billing_period);
        const scheduledChange = record(data.scheduled_change);
        const periodEnd = dateOrNull(currentPeriod.ends_at);
        const update: Prisma.SubscriptionUncheckedUpdateManyInput = {
          providerEventAt: occurredAt,
        };

        if (event.event_type === "subscription.canceled" || status === "canceled") {
          // Paddle emits the canceled event when cancellation takes effect (immediate
          // or at period end). At that point access must stop, not linger to an old end date.
          const canceledAt = dateOrNull(data.canceled_at) ?? occurredAt;
          update.status = "CANCELED";
          update.canceledAt = canceledAt;
          update.currentPeriodEnd = canceledAt;
          update.cancelAtPeriodEnd = false;
          update.graceEndsAt = null;
        } else if (status === "paused") {
          update.status = "PAUSED";
          update.currentPeriodEnd = null;
          update.cancelAtPeriodEnd = false;
          update.graceEndsAt = null;
        } else if (status === "past_due") {
          update.status = "PAST_DUE";
          update.graceEndsAt = new Date(occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (periodEnd) update.currentPeriodEnd = periodEnd;
        } else if (status === "active") {
          update.status = "ACTIVE";
          update.graceEndsAt = null;
          update.trialEndsAt = null;
          update.canceledAt = null;
          update.cancelAtPeriodEnd = scheduledChange.action === "cancel";
          if (periodEnd) update.currentPeriodEnd = periodEnd;
        } else if (status === "trialing") {
          const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
          const trialDates = record(items[0]?.trial_dates);
          update.status = "TRIALING";
          update.trialEndsAt = dateOrNull(trialDates.ends_at);
          update.graceEndsAt = null;
          if (periodEnd) update.currentPeriodEnd = periodEnd;
        }

        // Synchronize a plan/interval change only when the provider item matches
        // one of our explicitly configured recurring prices and quantity is one.
        if (Array.isArray(data.items) && data.items.length === 1) {
          const item = record(data.items[0]);
          const price = record(item.price);
          if (item.quantity === 1 && typeof price.id === "string") {
            const cycle = record(price.billing_cycle);
            const itemInterval = cycle.interval === "year" ? "YEARLY" : cycle.interval === "month" ? "MONTHLY" : null;
            if (itemInterval) {
              const plans = await tx.plan.findMany({ where: { isPublic: true } });
              const matchingPlan = plans.find((plan) => paddlePriceId(plan.key, itemInterval) === price.id);
              if (matchingPlan) {
                update.planId = matchingPlan.id;
                update.interval = itemInterval;
              }
            }
          }
        }

        await tx.subscription.updateMany({
          where: {
            id: existing.id,
            OR: [
              { providerEventAt: null },
              { providerEventAt: { lte: occurredAt } },
            ],
          },
          data: update,
        });
      }
    });
  } catch (error) {
    if (isUniqueConflict(error)) return NextResponse.json({ received: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ received: true });
}
