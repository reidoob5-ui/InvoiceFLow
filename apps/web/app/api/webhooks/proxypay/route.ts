import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getVerifiedProxyPayTransaction } from "@/lib/payments/proxypay";

export const runtime = "nodejs";

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

export async function POST(request: Request) {
  let callback: { id?: unknown; charge_id?: unknown };
  try { callback = await request.json(); } catch { return NextResponse.json({ error: "Payload inválido." }, { status: 400 }); }
  if (typeof callback.id !== "string" || typeof callback.charge_id !== "string") {
    return NextResponse.json({ error: "Callback sem identificadores de transacção." }, { status: 400 });
  }

  let verified;
  try {
    verified = await getVerifiedProxyPayTransaction(callback.id);
  } catch {
    return NextResponse.json({ error: "Não foi possível validar a transacção junto do fornecedor." }, { status: 401 });
  }
  if (verified.type !== "payment" || verified.charge_id !== callback.charge_id || !verified.amount || !verified.status) {
    return NextResponse.json({ error: "A transacção confirmada não corresponde ao callback." }, { status: 400 });
  }

  const invoice = await prisma.platformInvoice.findFirst({
    where: { provider: "proxypay", providerRef: verified.charge_id },
  });
  if (!invoice) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  if (!new Prisma.Decimal(verified.amount).equals(invoice.amount)) {
    return NextResponse.json({ error: "O montante confirmado não corresponde à factura." }, { status: 409 });
  }
  if (verified.status !== "accepted" && verified.status !== "rejected") {
    return NextResponse.json({ received: true, pending: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.providerWebhookEvent.create({
        data: { provider: "proxypay", eventId: verified.id },
      });

      if (verified.status === "rejected") {
        await tx.platformInvoice.updateMany({
          where: { id: invoice.id, status: "OPEN" },
          data: { status: "VOID" },
        });
        return;
      }

      if (!invoice.targetPlanId || !invoice.periodEnd) throw new Error("Invoice missing plan/period metadata.");

      // Claim the invoice before changing access. The conditional update prevents
      // a late/duplicate callback from activating a voided or already-paid invoice.
      const claimed = await tx.platformInvoice.updateMany({
        where: { id: invoice.id, status: "OPEN" },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (claimed.count !== 1) return;

      const subscription = await tx.subscription.upsert({
        where: { organizationId: invoice.organizationId },
        update: {
          planId: invoice.targetPlanId,
          status: "ACTIVE",
          interval: invoice.billingInterval,
          trialEndsAt: null,
          currentPeriodEnd: invoice.periodEnd,
          graceEndsAt: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          provider: "proxypay",
          providerRef: verified.id,
        },
        create: {
          organizationId: invoice.organizationId,
          planId: invoice.targetPlanId,
          status: "ACTIVE",
          interval: invoice.billingInterval,
          currentPeriodEnd: invoice.periodEnd,
          provider: "proxypay",
          providerRef: verified.id,
        },
      });
      await tx.platformInvoice.update({
        where: { id: invoice.id },
        data: { subscriptionId: subscription.id },
      });
    });
  } catch (error) {
    if (isUniqueConflict(error)) return NextResponse.json({ received: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ received: true });
}
