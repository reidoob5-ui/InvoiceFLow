import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { getPaySettings, newReference, whatsappLink } from "@/lib/billing/manual";

export const runtime = "nodejs";

const money = (v: unknown) => new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(Number(v));

function proofMessage(p: { orgName: string; planName: string; interval: string; amount: unknown; reference: string }) {
  return `Olá! Paguei a subscrição do InvoiceFlow.\nEmpresa: ${p.orgName}\nPlano: ${p.planName} (${p.interval === "YEARLY" ? "anual" : "mensal"})\nValor: ${money(p.amount)}\nReferência: ${p.reference}\nSegue o comprovativo em anexo.`;
}

/** Pagamentos manuais da empresa + dados para pagar + planos disponíveis. */
export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "billing:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { organizationId, organization } = current.membership;
  const [settings, rows, plans] = await Promise.all([
    getPaySettings(),
    prisma.platformInvoice.findMany({ where: { organizationId, provider: "manual" }, orderBy: { createdAt: "desc" }, take: 10,
      include: { targetPlan: { select: { name: true } } } }),
    prisma.plan.findMany({ where: { isPublic: true, currency: "AOA", monthlyPrice: { gt: 0 } }, orderBy: { sortOrder: "asc" },
      select: { key: true, name: true, monthlyPrice: true, yearlyPrice: true } }),
  ]);
  return NextResponse.json({
    settings: { bank: settings.pay_bank, holder: settings.pay_holder, iban: settings.pay_iban, express: settings.pay_express, note: settings.pay_note, whatsappConfigured: !!settings.admin_whatsapp },
    plans: plans.map((p) => ({ key: p.key, name: p.name, monthly: Number(p.monthlyPrice), yearly: Number(p.yearlyPrice) })),
    payments: rows.map((r) => ({
      id: r.id, reference: r.reference, status: r.status, amount: r.amount.toString(), interval: r.billingInterval, plan: r.targetPlan?.name ?? "",
      createdAt: r.createdAt, claimedAt: r.claimedAt, paidAt: r.paidAt, periodEnd: r.periodEnd, reviewNote: r.status === "VOID" ? r.reviewNote : null,
      whatsapp: r.status === "OPEN" && r.reference ? whatsappLink(settings.admin_whatsapp, proofMessage({ orgName: organization.name, planName: r.targetPlan?.name ?? "", interval: r.billingInterval, amount: r.amount, reference: r.reference })) : null,
    })),
  }, { headers: { "cache-control": "no-store" } });
}

/** Cria um pedido de pagamento manual (IBAN / Multicaixa Express). Não activa nada: só o administrador confirma. */
export async function POST(request: Request) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "billing:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Apenas o proprietário pode alterar a subscrição." }, { status: 403 });
    throw error;
  }
  const body = await request.json().catch(() => null) as { planKey?: unknown; interval?: unknown } | null;
  const planKey = typeof body?.planKey === "string" ? body.planKey : "";
  const interval = body?.interval === "YEARLY" ? "YEARLY" : body?.interval === "MONTHLY" ? "MONTHLY" : null;
  if (!/^[a-z0-9_-]{2,40}$/.test(planKey) || !interval) return NextResponse.json({ error: "Plano ou periodicidade inválidos." }, { status: 400 });
  const { organizationId } = current.membership;

  const plan = await prisma.plan.findFirst({ where: { key: planKey, isPublic: true, currency: "AOA" } });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const amount = new Prisma.Decimal(interval === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice);
  if (amount.lte(0)) return NextResponse.json({ error: "O plano gratuito não necessita de pagamento." }, { status: 422 });

  const open = await prisma.platformInvoice.findFirst({ where: { organizationId, provider: "manual", status: "OPEN" } });
  if (open?.claimedAt) return NextResponse.json({ error: "Já tens um pagamento em análise. Aguarda a confirmação ou fala com o suporte.", code: "PENDING_REVIEW" }, { status: 409 });

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        // Um pedido por empresa: substitui o anterior se o cliente ainda não avisou que pagou.
        await tx.platformInvoice.updateMany({ where: { organizationId, provider: "manual", status: "OPEN", claimedAt: null }, data: { status: "VOID", reviewedAt: new Date(), reviewNote: "Substituído por um novo pedido." } });
        return tx.platformInvoice.create({ data: {
          organizationId, number: "SUB-" + Date.now() + "-" + randomUUID().slice(0, 8).toUpperCase(), amount, currency: "AOA", status: "OPEN",
          targetPlanId: plan.id, billingInterval: interval, provider: "manual", method: "TRANSFER", reference: newReference(),
        } });
      });
      await audit({ organizationId, userId: current.user.id, action: "billing.manual.requested", entityType: "PlatformInvoice", entityId: created.id, metadata: { plan: plan.key, interval, reference: created.reference } });
      return NextResponse.json({ ok: true, id: created.id, reference: created.reference }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue; // referência repetida: tenta outra
      throw error;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar a referência. Tenta novamente." }, { status: 503 });
}
