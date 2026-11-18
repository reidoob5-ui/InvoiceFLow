import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { paddlePriceId, verifyPaddleWebhook } from "@/lib/payments/paddle";

export const runtime = "nodejs";

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function nextPeriod(interval: "MONTHLY" | "YEARLY") {
  const end = new Date();
  if (interval === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
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
    data?: Record<string, unknown>;
  };
  try { event = JSON.parse(rawBody) as typeof event; } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  if (!event.event_id || !event.event_type || !event.data) {
    return NextResponse.json({ error: "Evento Paddle incompleto." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.providerWebhookEvent.create({
        data: { provider: "paddle", eventId: event.event_id! },
      });

      const data = event.data!;
      if (event.event_type === "transaction.completed") {
        if (data.status !== "completed" || typeof data.subscription_id !== "string") return;
        const custom = (data.custom_data && typeof data.custom_data === "object"
          ? data.custom_data : {}) as Record<string, unknown>;
        const existing = await tx.subscription.findFirst({
          where: { provider: "paddle", providerRef: data.subscription_id },
          include: { plan: true },
        });
        const organizationId = typeof custom.organizationId === "string" ? custom.organizationId : existing?.organizationId;
        const planKey = typeof custom.planKey === "string" ? custom.planKey : existing?.plan.key;
        const interval = custom.interval === "YEARLY" || existing?.interval === "YEARLY" ? "YEARLY" : "MONTHLY";
        if (!organizationId || !planKey) throw new Error("Paddle transaction has no matching InvoiceFlow organization/plan.");
        const expectedPrice = paddlePriceId(planKey, interval);
        const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
        const containsExpectedPrice = items.some((item) => {
          const price = item.price && typeof item.price === "object" ? item.price as Record<string, unknown> : {};
          return price.id === expectedPrice || item.price_id === expectedPrice;
        });
        if (!expectedPrice || !containsExpectedPrice) throw new Error("Paddle transaction price does not match the configured plan.");
        const plan = await tx.plan.findFirst({ where: { key: planKey, isPublic: true } });
        if (!plan) throw new Error("Paddle plan no longer exists.");
        const billingPeriod = data.billing_period && typeof data.billing_period === "object"
          ? data.billing_period as Record<string, unknown> : {};
        const parsedEnd = typeof billingPeriod.ends_at === "string" ? new Date(billingPeriod.ends_at) : null;
        const periodEnd = parsedEnd && Number.isFinite(parsedEnd.getTime()) ? parsedEnd : nextPeriod(interval);
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
          },
          create: {
            organizationId,
            planId: plan.id,
            status: "ACTIVE",
            interval,
            currentPeriodEnd: periodEnd,
            provider: "paddle",
            providerRef: data.subscription_id,
          },
        });
      } else if (event.event_type === "subscription.canceled" && typeof data.id === "string") {
        await tx.subscription.updateMany({
          where: { provider: "paddle", providerRef: data.id },
          data: { status: "CANCELED", canceledAt: new Date(), cancelAtPeriodEnd: false },
        });
      } else if (event.event_type === "subscription.updated" && typeof data.id === "string") {
        if (data.status === "past_due") {
          const graceEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await tx.subscription.updateMany({
            where: { provider: "paddle", providerRef: data.id },
            data: { status: "PAST_DUE", graceEndsAt },
          });
        } else if (data.status === "active") {
          await tx.subscription.updateMany({
            where: { provider: "paddle", providerRef: data.id },
            data: { status: "ACTIVE", graceEndsAt: null },
          });
        }
      }
    });
  } catch (error) {
    if (isUniqueConflict(error)) return NextResponse.json({ received: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ received: true });
}
