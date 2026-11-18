import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { createProxyPayCharge, isProxyPayConfigured } from "@/lib/payments/proxypay";

export const runtime = "nodejs";

function periodEnd(start: Date, interval: "MONTHLY" | "YEARLY") {
  const year = start.getUTCFullYear() + (interval === "YEARLY" ? 1 : 0);
  const month = start.getUTCMonth() + (interval === "MONTHLY" ? 1 : 0);
  const day = start.getUTCDate();
  const end = new Date(Date.UTC(year, month, 1, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

export async function POST(request: Request) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try {
    assertCan(current.membership.role, "billing:write");
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Apenas o proprietário pode alterar a subscrição." }, { status: 403 });
    throw error;
  }
  if (!isProxyPayConfigured()) return NextResponse.json({ error: "MULTICAIXA ainda não está configurado. São necessárias credenciais de comerciante ProxyPay/EMIS." }, { status: 503 });

  let body: { planKey?: string; interval?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); }
  const planKey = typeof body.planKey === "string" ? body.planKey : "";
  const interval = body.interval === "YEARLY" ? "YEARLY" : body.interval === "MONTHLY" ? "MONTHLY" : null;
  if (!/^[a-z0-9_-]{2,40}$/.test(planKey) || !interval) return NextResponse.json({ error: "Plano ou periodicidade inválidos." }, { status: 400 });

  const plan = await prisma.plan.findFirst({ where: { key: planKey, isPublic: true } });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  if (plan.currency !== "AOA") return NextResponse.json({ error: "O MULTICAIXA só pode cobrar planos configurados em AOA." }, { status: 422 });

  const amount = new Prisma.Decimal(interval === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice);
  if (amount.lte(0)) return NextResponse.json({ error: "O plano gratuito não necessita de pagamento." }, { status: 422 });

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !appUrl.startsWith("https://")) return NextResponse.json({ error: "APP_URL HTTPS não está configurado." }, { status: 503 });

  const now = new Date();
  const end = periodEnd(now, interval);
  const invoice = await prisma.platformInvoice.create({
    data: {
      organizationId: current.membership.organizationId,
      number: "SUB-" + Date.now() + "-" + randomUUID().slice(0, 8).toUpperCase(),
      amount,
      currency: "AOA",
      status: "OPEN",
      periodStart: now,
      periodEnd: end,
      targetPlanId: plan.id,
      billingInterval: interval,
      provider: "proxypay",
    },
  });

  try {
    const charge = await createProxyPayCharge({
      amount: amount.toFixed(2),
      callbackUrl: appUrl.replace(/\/$/, "") + "/api/webhooks/proxypay",
    });
    await prisma.platformInvoice.update({ where: { id: invoice.id }, data: { providerRef: charge.id } });
    return NextResponse.json({
      provider: "MULTICAIXA",
      invoiceId: invoice.id,
      amount: amount.toFixed(2),
      currency: "AOA",
      qrCodeUrl: charge.qrcode_url,
      deeplink: charge.deeplink,
      deeplinkRedirect: charge.deeplink_redirect,
      expiresAt: charge.expires_at,
      status: "PENDING",
    }, { status: 201 });
  } catch (error) {
    await prisma.platformInvoice.delete({ where: { id: invoice.id } }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível iniciar o pagamento." }, { status: 502 });
  }
}
