import { prisma } from "@/lib/db";
import { D, formatMoney } from "@/lib/money";
import { can, type Role } from "@/lib/permissions";
import { classifySubscription } from "@/lib/billing/pure";
import { DEMO_SLUG } from "@/lib/demo";

const DAY = 24 * 60 * 60 * 1000;
const OPEN_INVOICES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;
const OPEN_BILLS = ["OPEN", "PARTIALLY_PAID"] as const;

export type Signal = {
  id: string;
  severity: "critical" | "warning" | "info" | "good";
  title: string;
  detail: string;
  href?: string;
  /** Pergunta pronta para enviar ao assistente quando o utilizador quer saber mais. */
  ask?: string;
};

type SumRow = { currency: string; _sum: { total?: unknown; amountPaid?: unknown; amount?: unknown }; _count?: { _all: number } };

/**
 * Alertas e oportunidades calculados só com regras sobre os dados reais (sem IA, sem custo).
 * Só devolve áreas que o papel do utilizador pode ler. O ID inclui o período para que um alerta
 * dispensado volte a aparecer se o problema mudar.
 */
export async function computeSignals(organizationId: string, role: Role, baseCurrency: string): Promise<Signal[]> {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const key = today.toISOString().slice(0, 10);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const in7 = new Date(today.getTime() + 7 * DAY);
  const in5 = new Date(today.getTime() + 5 * DAY);
  const money = (v: unknown, c: string) => formatMoney(D(v as string | number), c, "pt");
  const left = (rows: SumRow[]) => rows.map((r) => money(D((r._sum.total as string) ?? 0).minus((r._sum.amountPaid as string) ?? 0), r.currency)).join(" + ");
  const out: Signal[] = [];

  const canInv = can(role, "invoices:read");
  const canExp = can(role, "expenses:read");
  const canRep = can(role, "reports:read");
  const canFiscal = can(role, "fiscal:read");
  const canQuotes = can(role, "quotes:read");

  const [overdueRaw, oldest, billsOverdueRaw, billsSoonRaw, pay30, payPrev, exp30, expPrev, quotesSoon, oldDrafts, profile] = await Promise.all([
    canInv ? prisma.invoice.groupBy({ by: ["currency"], where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { lt: today } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }) : [],
    canInv ? prisma.invoice.findFirst({ where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { lt: today } }, orderBy: { dueDate: "asc" }, select: { dueDate: true } }) : null,
    canExp ? prisma.bill.groupBy({ by: ["currency"], where: { organizationId, status: { in: [...OPEN_BILLS] }, dueDate: { lt: today } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }) : [],
    canExp ? prisma.bill.groupBy({ by: ["currency"], where: { organizationId, status: { in: [...OPEN_BILLS] }, dueDate: { gte: today, lte: in7 } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }) : [],
    canRep ? prisma.payment.aggregate({ where: { organizationId, status: "CONFIRMED", currency: baseCurrency, receivedAt: { gte: d30 } }, _sum: { amount: true } }) : null,
    canRep ? prisma.payment.aggregate({ where: { organizationId, status: "CONFIRMED", currency: baseCurrency, receivedAt: { gte: d60, lt: d30 } }, _sum: { amount: true } }) : null,
    canRep ? prisma.expense.aggregate({ where: { organizationId, status: "PAID", currency: baseCurrency, date: { gte: d30 } }, _sum: { amount: true } }) : null,
    canRep ? prisma.expense.aggregate({ where: { organizationId, status: "PAID", currency: baseCurrency, date: { gte: d60, lt: d30 } }, _sum: { amount: true } }) : null,
    canQuotes ? prisma.quote.count({ where: { organizationId, status: "SENT", validUntil: { lte: in5 } } }) : 0,
    canInv ? prisma.invoice.count({ where: { organizationId, status: "DRAFT", createdAt: { lt: new Date(now.getTime() - 7 * DAY) } } }) : 0,
    canFiscal ? prisma.fiscalProfile.findUnique({ where: { organizationId }, select: { enabled: true } }) : null,
  ]);

  const overdue = overdueRaw as unknown as SumRow[];
  const billsOverdue = billsOverdueRaw as unknown as SumRow[];
  const billsSoon = billsSoonRaw as unknown as SumRow[];

  if (overdue.length) {
    const count = overdue.reduce((n, r) => n + (r._count?._all ?? 0), 0);
    const days = oldest?.dueDate ? Math.max(1, Math.floor((today.getTime() - oldest.dueDate.getTime()) / DAY)) : 0;
    out.push({ id: `overdue:${key}:${count}`, severity: days > 30 ? "critical" : "warning", title: `${count} ${count === 1 ? "factura em atraso" : "facturas em atraso"}`,
      detail: `${left(overdue)} por cobrar${days ? `; a mais antiga venceu há ${days} dias` : ""}. Quanto mais tempo passa, mais difícil é receber.`, href: "/collections",
      ask: "Que clientes devo contactar primeiro para cobrar facturas em atraso? Escreve uma mensagem de cobrança para o mais urgente." });
  } else if (canInv) {
    out.push({ id: `nooverdue:${key}`, severity: "good", title: "Sem facturas em atraso", detail: "Todos os recebimentos estão dentro do prazo. Bom trabalho.", href: "/invoices" });
  }

  if (billsOverdue.length) {
    const count = billsOverdue.reduce((n, r) => n + (r._count?._all ?? 0), 0);
    out.push({ id: `billsoverdue:${key}:${count}`, severity: "critical", title: `${count} ${count === 1 ? "conta a pagar vencida" : "contas a pagar vencidas"}`,
      detail: `${left(billsOverdue)} em dívida a fornecedores. Atrasos podem trazer juros e prejudicar a relação.`, href: "/bills", ask: "Que contas a pagar estão vencidas e qual devo pagar primeiro?" });
  }
  if (billsSoon.length) {
    const count = billsSoon.reduce((n, r) => n + (r._count?._all ?? 0), 0);
    out.push({ id: `billssoon:${key}:${count}`, severity: "info", title: `${count} ${count === 1 ? "conta vence" : "contas vencem"} nos próximos 7 dias`, detail: `${left(billsSoon)} a pagar. Confirma que há saldo.`, href: "/bills" });
  }

  const inNow = Number(pay30?._sum.amount ?? 0), inPrev = Number(payPrev?._sum.amount ?? 0);
  if (inPrev > 0 && inNow < inPrev * 0.7) {
    out.push({ id: `revdrop:${key.slice(0, 7)}`, severity: "warning", title: `Recebimentos em queda (${Math.round((1 - inNow / inPrev) * 100)}%)`,
      detail: `Nos últimos 30 dias entraram ${money(inNow, baseCurrency)}, contra ${money(inPrev, baseCurrency)} nos 30 dias anteriores.`, href: "/reports",
      ask: "Os meus recebimentos caíram nos últimos 30 dias. Quais podem ser as causas e que 3 acções concretas posso tomar esta semana?" });
  } else if (inPrev > 0 && inNow >= inPrev * 1.2) {
    out.push({ id: `revup:${key.slice(0, 7)}`, severity: "good", title: `Recebimentos a crescer (+${Math.round((inNow / inPrev - 1) * 100)}%)`,
      detail: `${money(inNow, baseCurrency)} nos últimos 30 dias, contra ${money(inPrev, baseCurrency)} antes.`, href: "/reports",
      ask: "Os meus recebimentos estão a crescer. O que está a funcionar e como posso manter este ritmo?" });
  }

  const outNow = Number(exp30?._sum.amount ?? 0), outPrev = Number(expPrev?._sum.amount ?? 0);
  if (outPrev > 0 && outNow > outPrev * 1.3) {
    out.push({ id: `expup:${key.slice(0, 7)}`, severity: "warning", title: `Despesas a subir (+${Math.round((outNow / outPrev - 1) * 100)}%)`,
      detail: `${money(outNow, baseCurrency)} nos últimos 30 dias, contra ${money(outPrev, baseCurrency)} antes.`, href: "/expenses",
      ask: "As minhas despesas subiram nos últimos 30 dias. Onde posso cortar ou renegociar?" });
  }
  if (outNow > 0 && outNow > inNow) {
    out.push({ id: `negcash:${key.slice(0, 7)}`, severity: "critical", title: "Saíram mais do que entraram",
      detail: `Nos últimos 30 dias: despesas ${money(outNow, baseCurrency)} contra recebimentos ${money(inNow, baseCurrency)}. O caixa está a diminuir.`, href: "/reports",
      ask: "Estou a gastar mais do que recebo. Faz-me um plano de 30 dias para voltar a ter caixa positivo." });
  }

  if (quotesSoon > 0) out.push({ id: `quotes:${key}:${quotesSoon}`, severity: "info", title: `${quotesSoon} ${quotesSoon === 1 ? "orçamento a expirar" : "orçamentos a expirar"}`, detail: "Orçamentos enviados que expiram em 5 dias. Um contacto agora pode fechar a venda.", href: "/quotes" });
  if (oldDrafts > 0) out.push({ id: `drafts:${key}:${oldDrafts}`, severity: "info", title: `${oldDrafts} ${oldDrafts === 1 ? "rascunho esquecido" : "rascunhos esquecidos"}`, detail: "Facturas em rascunho há mais de 7 dias. Dinheiro que ainda não está a ser cobrado.", href: "/invoices" });

  if (profile?.enabled) {
    const [bad, urgent, uncertified] = await Promise.all([
      prisma.fiscalDelivery.count({ where: { organizationId, state: { in: ["INVALID", "BLOCKED"] } } }),
      prisma.fiscalDelivery.count({ where: { organizationId, state: { in: ["PENDING", "RETRY"] }, deadlineAt: { lt: new Date(now.getTime() + 6 * 3600_000) } } }),
      (async () => {
        const certified = await prisma.fiscalDocument.findMany({ where: { organizationId, invoiceId: { not: null }, createdAt: { gte: d30 } }, select: { invoiceId: true }, take: 5000 });
        return prisma.invoice.count({ where: { organizationId, type: "INVOICE", status: { in: [...OPEN_INVOICES, "PAID"] }, issueDate: { gte: d30 }, id: { notIn: certified.map((c) => c.invoiceId as string) } } });
      })(),
    ]);
    if (bad > 0) out.push({ id: `fiscalbad:${key}:${bad}`, severity: "critical", title: `${bad} ${bad === 1 ? "documento rejeitado" : "documentos rejeitados"} pela AGT`, detail: "Há documentos fiscais inválidos ou bloqueados. Corrige-os com um documento de correcção.", href: "/fiscal", ask: "Tenho documentos rejeitados pela AGT. O que devo verificar e como corrijo?" });
    if (urgent > 0) out.push({ id: `fiscalurgent:${key}:${urgent}`, severity: "critical", title: `${urgent} ${urgent === 1 ? "documento perto do prazo" : "documentos perto do prazo"} de envio à AGT`, detail: "O prazo de 24 horas está a acabar. Corre a sincronização agora.", href: "/fiscal" });
    if (uncertified > 0) out.push({ id: `uncert:${key}:${uncertified}`, severity: "warning", title: `${uncertified} ${uncertified === 1 ? "factura sem certificação" : "facturas sem certificação"} AGT`, detail: "Facturas emitidas nos últimos 30 dias que ainda não foram certificadas.", href: "/invoices" });
  }

  if (can(role, "billing:read")) out.push(...(await subscriptionSignals(organizationId, now, key)));

  const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 12);
}

/** Avisos da subscrição da própria empresa (expira, expirou, pagamento em análise). */
async function subscriptionSignals(organizationId: string, now: Date, key: string): Promise<Signal[]> {
  const [sub, pending] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId }, select: { status: true, trialEndsAt: true, currentPeriodEnd: true, graceEndsAt: true, plan: { select: { name: true, monthlyPrice: true } } } }),
    prisma.platformInvoice.findFirst({ where: { organizationId, provider: "manual", status: "OPEN" }, select: { claimedAt: true, reference: true } }),
  ]);
  if (!sub) return [];
  const state = classifySubscription(sub, Number(sub.plan.monthlyPrice), now);
  const out: Signal[] = [];
  const daysTo = (d?: Date | null) => (d ? Math.max(0, Math.ceil((d.getTime() - now.getTime()) / DAY)) : 0);
  if (pending?.claimedAt) {
    out.push({ id: `subpending:${pending.reference}`, severity: "info", title: "Pagamento em análise", detail: `Recebemos o teu aviso de pagamento (ref. ${pending.reference}). O plano é activado assim que o administrador o confirmar.`, href: "/billing" });
    return out;
  }
  if (state === "UNPAID") out.push({ id: `subexpired:${key}`, severity: "critical", title: "A tua subscrição expirou", detail: "Enquanto não renovares, não consegues criar nem alterar dados. Gera uma referência de pagamento para reactivar.", href: "/billing" });
  else if (state === "EXPIRING") { const n = daysTo(sub.currentPeriodEnd); out.push({ id: `subexpiring:${key}`, severity: n <= 3 ? "critical" : "warning", title: `O teu plano ${sub.plan.name} expira ${n <= 0 ? "hoje" : `em ${n} ${n === 1 ? "dia" : "dias"}`}`, detail: "Renova a tempo para não perderes o acesso. Pagas e envias o comprovativo por WhatsApp.", href: "/billing" }); }
  else if (state === "TRIAL" && sub.trialEndsAt && sub.trialEndsAt.getTime() - now.getTime() <= 5 * DAY) { const n = daysTo(sub.trialEndsAt); out.push({ id: `subtrial:${key}`, severity: "warning", title: `O período experimental termina ${n <= 0 ? "hoje" : `em ${n} ${n === 1 ? "dia" : "dias"}`}`, detail: "Escolhe um plano para continuares a usar tudo sem interrupções.", href: "/billing" }); }
  return out;
}

/** Avisos só para o administrador da plataforma (com o cofre aberto): pagamentos por confirmar e planos a expirar. */
export async function adminSignals(now = new Date()): Promise<Signal[]> {
  const realOrg = { slug: { not: DEMO_SLUG } };
  const key = now.toISOString().slice(0, 10);
  const [claimed, openOnly, expiring, expired] = await Promise.all([
    prisma.platformInvoice.count({ where: { provider: "manual", status: "OPEN", claimedAt: { not: null }, organization: realOrg } }),
    prisma.platformInvoice.count({ where: { provider: "manual", status: "OPEN", claimedAt: null, organization: realOrg } }),
    prisma.subscription.count({ where: { status: "ACTIVE", currentPeriodEnd: { gte: now, lte: new Date(now.getTime() + 7 * DAY) }, plan: { monthlyPrice: { gt: 0 } }, organization: realOrg } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "EXPIRED"] }, currentPeriodEnd: { lt: now }, plan: { monthlyPrice: { gt: 0 } }, organization: realOrg } }),
  ]);
  const out: Signal[] = [];
  if (claimed > 0) out.push({ id: `adminclaimed:${claimed}`, severity: "critical", title: `${claimed} ${claimed === 1 ? "pagamento à espera" : "pagamentos à espera"} da tua confirmação`, detail: "Clientes que dizem que já pagaram. Confere o comprovativo no WhatsApp e confirma.", href: "/admin?tab=pagamentos" });
  if (openOnly > 0) out.push({ id: `adminopen:${key}:${openOnly}`, severity: "info", title: `${openOnly} ${openOnly === 1 ? "pedido de pagamento" : "pedidos de pagamento"} ainda sem comprovativo`, detail: "Geraram a referência mas ainda não avisaram que pagaram.", href: "/admin?tab=pagamentos" });
  if (expiring > 0) out.push({ id: `adminexpiring:${key}:${expiring}`, severity: "warning", title: `${expiring} ${expiring === 1 ? "subscrição expira" : "subscrições expiram"} nos próximos 7 dias`, detail: "Boa altura para lembrares estes clientes de renovar.", href: "/admin?tab=subscricoes" });
  if (expired > 0) out.push({ id: `adminexpired:${key}:${expired}`, severity: "warning", title: `${expired} ${expired === 1 ? "empresa não pagou" : "empresas não pagaram"} (expiradas)`, detail: "Já perderam o acesso de escrita até renovarem.", href: "/admin?tab=subscricoes" });
  return out;
}
