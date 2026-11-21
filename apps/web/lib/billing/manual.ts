import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addPeriod } from "@/lib/billing/pure";
export { addPeriod, newReference, whatsappLink, classifySubscription, type PayState } from "@/lib/billing/pure";

export const SETTING_KEYS = ["pay_bank", "pay_holder", "pay_iban", "pay_bank2", "pay_iban2", "pay_express", "admin_whatsapp", "pay_note"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type PaySettings = Record<SettingKey, string>;

export async function getPaySettings(): Promise<PaySettings> {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ""])) as PaySettings;
  for (const r of rows) out[r.key as SettingKey] = r.value;
  return out;
}

export class BillingAdminError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/**
 * Confirma um pagamento manual e activa o plano. Só o administrador chama isto.
 * A factura é "reclamada" com um UPDATE condicional (OPEN → PAID), por isso confirmar duas vezes é inofensivo.
 * Se a empresa ainda tem o mesmo plano activo, o novo período soma-se ao que resta em vez de o perder.
 */
export async function confirmManualPayment(invoiceId: string, adminId: string, opts: { note?: string; periodEnd?: Date } = {}) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.platformInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.provider !== "manual") throw new BillingAdminError("Pagamento não encontrado.", 404);
    if (invoice.status === "PAID") throw new BillingAdminError("Este pagamento já foi confirmado.", 409);
    if (invoice.status === "VOID") throw new BillingAdminError("Este pagamento foi rejeitado ou anulado.", 409);
    if (!invoice.targetPlanId) throw new BillingAdminError("Pagamento sem plano associado.", 422);

    const now = new Date();
    const existing = await tx.subscription.findUnique({ where: { organizationId: invoice.organizationId } });
    const renewing = existing && existing.status === "ACTIVE" && existing.planId === invoice.targetPlanId && existing.currentPeriodEnd && existing.currentPeriodEnd > now;
    const start = renewing ? existing!.currentPeriodEnd! : now;
    const end = opts.periodEnd ?? addPeriod(start, invoice.billingInterval);
    if (end <= now) throw new BillingAdminError("A data de fim do período tem de ser futura.", 422);

    const claimed = await tx.platformInvoice.updateMany({
      where: { id: invoice.id, status: "OPEN" },
      data: { status: "PAID", paidAt: now, periodStart: start, periodEnd: end, reviewedAt: now, reviewedById: adminId, reviewNote: opts.note?.slice(0, 500) || null },
    });
    if (claimed.count !== 1) throw new BillingAdminError("Este pagamento já foi tratado.", 409);

    const subscription = await tx.subscription.upsert({
      where: { organizationId: invoice.organizationId },
      update: { planId: invoice.targetPlanId, status: "ACTIVE", interval: invoice.billingInterval, trialEndsAt: null, currentPeriodEnd: end, graceEndsAt: null, cancelAtPeriodEnd: false, canceledAt: null, provider: "manual", providerRef: invoice.reference },
      create: { organizationId: invoice.organizationId, planId: invoice.targetPlanId, status: "ACTIVE", interval: invoice.billingInterval, currentPeriodEnd: end, provider: "manual", providerRef: invoice.reference },
    });
    await tx.platformInvoice.update({ where: { id: invoice.id }, data: { subscriptionId: subscription.id } });
    return { organizationId: invoice.organizationId, reference: invoice.reference, periodEnd: end, amount: invoice.amount.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectManualPayment(invoiceId: string, adminId: string, reason: string) {
  const result = await prisma.platformInvoice.updateMany({
    where: { id: invoiceId, provider: "manual", status: "OPEN" },
    data: { status: "VOID", reviewedAt: new Date(), reviewedById: adminId, reviewNote: reason.slice(0, 500) },
  });
  if (result.count !== 1) throw new BillingAdminError("Pagamento não encontrado ou já tratado.", 409);
  return prisma.platformInvoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { organizationId: true, reference: true } });
}

export type SubscriptionAction =
  | { action: "suspend" }
  | { action: "reactivate"; days: number }
  | { action: "extend"; days: number }
  | { action: "setPlan"; planKey: string };

/** Acções do administrador sobre a subscrição de uma empresa (concessões, suspensão, mudança de plano). */
export async function adminSubscriptionAction(organizationId: string, input: SubscriptionAction) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) throw new BillingAdminError("Empresa não encontrada.", 404);
  const sub = await prisma.subscription.findUnique({ where: { organizationId } });
  const now = new Date();

  if (input.action === "suspend") {
    if (!sub) throw new BillingAdminError("A empresa não tem subscrição.", 404);
    return prisma.subscription.update({ where: { organizationId }, data: { status: "PAUSED" } });
  }
  if (input.action === "extend" || input.action === "reactivate") {
    const days = Math.floor(input.days);
    if (!Number.isFinite(days) || days < 1 || days > 366) throw new BillingAdminError("Indica entre 1 e 366 dias.", 422);
    if (!sub) throw new BillingAdminError("A empresa não tem subscrição. Atribui primeiro um plano.", 404);
    const base = input.action === "extend" && sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const end = new Date(base.getTime() + days * 86400_000);
    return prisma.subscription.update({ where: { organizationId }, data: { status: "ACTIVE", currentPeriodEnd: end, graceEndsAt: null, cancelAtPeriodEnd: false, canceledAt: null, trialEndsAt: null, provider: sub.provider ?? "manual" } });
  }
  const plan = await prisma.plan.findUnique({ where: { key: input.planKey } });
  if (!plan) throw new BillingAdminError("Plano não encontrado.", 404);
  if (sub) return prisma.subscription.update({ where: { organizationId }, data: { planId: plan.id } });
  return prisma.subscription.create({ data: { organizationId, planId: plan.id, status: "EXPIRED", currentPeriodEnd: now, provider: "manual" } });
}

// ───────────────────────── Estado efectivo, definições, expiração e avisos ─────────────────────────

export async function savePaySettings(values: Partial<PaySettings>) {
  const entries = SETTING_KEYS.filter((k) => typeof values[k] === "string").map((k) => [k, (values[k] as string).trim().slice(0, 300)] as const);
  await prisma.$transaction(entries.map(([key, value]) =>
    prisma.platformSetting.upsert({ where: { key }, update: { value }, create: { key, value } })));
}

/**
 * Marca como EXPIRED as subscrições manuais cujo período (ou teste) terminou, para o estado guardado coincidir
 * com o acesso real. Não toca em subscrições Paddle/ProxyPay: essas seguem os seus webhooks.
 */
export async function expireManualSubscriptions(now = new Date()) {
  const [paid, trials] = await Promise.all([
    prisma.subscription.updateMany({ where: { status: "ACTIVE", provider: "manual", currentPeriodEnd: { lt: now } }, data: { status: "EXPIRED" } }),
    prisma.subscription.updateMany({ where: { status: "TRIALING", trialEndsAt: { lt: now } }, data: { status: "EXPIRED" } }),
  ]);
  return { expired: paid.count, trialsEnded: trials.count };
}

/** Aviso por email ao proprietário da empresa (best-effort: sem SMTP simplesmente não envia). */
export async function notifyOrgOwner(organizationId: string, subject: string, text: string) {
  try {
    const owner = await prisma.membership.findFirst({ where: { organizationId, role: "OWNER", status: "ACTIVE" }, select: { user: { select: { email: true } } } });
    if (!owner?.user.email) return { sent: false as const };
    const { sendMail } = await import("@/lib/mailer");
    return await sendMail({ to: owner.user.email, subject, text });
  } catch (error) {
    console.error("[billing/notify]", error instanceof Error ? error.message : error);
    return { sent: false as const };
  }
}
