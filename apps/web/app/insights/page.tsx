import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock,
  CheckCircle2, CircleDollarSign, Lightbulb, ReceiptText, ShieldAlert, Sparkles, Wallet,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { D, formatMoney } from "@/lib/money";

const DAY = 24 * 60 * 60 * 1000;
const OPEN_INVOICES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;
const OPEN_BILLS = ["OPEN", "PARTIALLY_PAID"] as const;

function money(value: unknown, currency: string, locale: string) {
  return formatMoney(D(value as string | number | null | undefined), currency, locale);
}
function dateLabel(value: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "pt-PT", {
    dateStyle: "medium", timeZone,
  }).format(value);
}
export default async function FinancialIntelligencePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "reports:read")) redirect("/dashboard");

  const organizationId = current.membership.organizationId;
  const locale = current.user.locale || current.membership.organization.locale || "pt";
  const timeZone = "UTC";
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenDays = new Date(today.getTime() + 7 * DAY);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);

  const [
    overdueReceivables, overduePayables, upcomingInvoices, upcomingInvoiceCount, upcomingBills, upcomingBillCount,
    cashIn30, expenses30, supplierPaymentsCount, supplierPayments30,
    expiringQuotes, expiringQuotesCount, recurringExpenses,
  ] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["currency"],
      where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { lt: today } },
      _sum: { total: true, amountPaid: true }, _count: { _all: true },
    }),
    prisma.bill.groupBy({
      by: ["currency"],
      where: { organizationId, status: { in: [...OPEN_BILLS] }, dueDate: { lt: today } },
      _sum: { total: true, amountPaid: true }, _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { gte: today, lte: sevenDays } },
      orderBy: { dueDate: "asc" }, take: 8,
      select: { id: true, number: true, currency: true, total: true, amountPaid: true, dueDate: true, client: { select: { name: true } } },
    }),
    prisma.invoice.count({
      where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { gte: today, lte: sevenDays } },
    }),
    prisma.bill.findMany({
      where: { organizationId, status: { in: [...OPEN_BILLS] }, dueDate: { gte: today, lte: sevenDays } },
      orderBy: { dueDate: "asc" }, take: 8,
      select: { id: true, number: true, currency: true, total: true, amountPaid: true, dueDate: true, supplier: { select: { name: true } } },
    }),
    prisma.bill.count({
      where: { organizationId, status: { in: [...OPEN_BILLS] }, dueDate: { gte: today, lte: sevenDays } },
    }),
    prisma.payment.groupBy({
      by: ["currency"], where: { organizationId, status: "CONFIRMED", receivedAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["currency"], where: { organizationId, status: "PAID", billId: null, date: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
    prisma.billPayment.count({ where: { organizationId, paidAt: { gte: thirtyDaysAgo } } }),
    prisma.billPayment.findMany({
      where: { organizationId, paidAt: { gte: thirtyDaysAgo } },
      select: { amount: true, bill: { select: { currency: true } } },
      take: 5000,
    }),
    prisma.quote.findMany({
      where: { organizationId, status: "SENT", validUntil: { gte: today, lte: sevenDays } },
      orderBy: { validUntil: "asc" }, take: 8,
      select: { id: true, number: true, title: true, currency: true, total: true, validUntil: true, client: { select: { name: true } } },
    }),
    prisma.quote.count({
      where: { organizationId, status: "SENT", validUntil: { gte: today, lte: sevenDays } },
    }),
    prisma.expense.groupBy({
      by: ["currency"], where: { organizationId, recurringFreq: { not: null }, nextRecurrence: { gte: today, lte: new Date(today.getTime() + 30 * DAY) } },
      _sum: { amount: true }, _count: { _all: true },
    }),
  ]);

  const supplierPaymentsComplete = supplierPaymentsCount <= 5000;
  const cashRows = new Map<string, { received: ReturnType<typeof D>; expenses: ReturnType<typeof D>; suppliers: ReturnType<typeof D> }>();
  const bucket = (currency: string) => {
    const key = currency.toUpperCase();
    if (!cashRows.has(key)) cashRows.set(key, { received: D(0), expenses: D(0), suppliers: D(0) });
    return cashRows.get(key)!;
  };
  for (const item of cashIn30) bucket(item.currency).received = D(item._sum.amount);
  for (const item of expenses30) bucket(item.currency).expenses = D(item._sum.amount);
  if (supplierPaymentsComplete) {
    for (const item of supplierPayments30) {
      const currency = item.bill.currency.toUpperCase();
      bucket(currency).suppliers = bucket(currency).suppliers.plus(item.amount);
    }
  }
  const cashSummary = [...cashRows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, values]) => ({
    currency, ...values,
    net: supplierPaymentsComplete ? values.received.minus(values.expenses).minus(values.suppliers) : null,
  }));

  const receivableRows = overdueReceivables.map(item => ({
    currency: item.currency,
    amount: D(item._sum.total).minus(item._sum.amountPaid ?? 0).gt(0) ? D(item._sum.total).minus(item._sum.amountPaid ?? 0) : D(0),
    count: item._count._all,
  })).filter(item => item.amount.gt(0));
  const payableRows = overduePayables.map(item => ({
    currency: item.currency,
    amount: D(item._sum.total).minus(item._sum.amountPaid ?? 0).gt(0) ? D(item._sum.total).minus(item._sum.amountPaid ?? 0) : D(0),
    count: item._count._all,
  })).filter(item => item.amount.gt(0));

  const totalOverdueInvoices = receivableRows.reduce((sum, item) => sum + item.count, 0);
  const totalOverdueBills = payableRows.reduce((sum, item) => sum + item.count, 0);
  const totalUpcomingInvoices = upcomingInvoiceCount;
  const totalUpcomingBills = upcomingBillCount;
  const totalExpiringQuotes = expiringQuotesCount;
  const totalRecurring = recurringExpenses.reduce((sum, item) => sum + item._count._all, 0);

  const recommendations: Array<{ level: "danger" | "warning" | "good" | "info"; title: string; detail: string; href: string }> = [];
  if (totalOverdueInvoices > 0) recommendations.push({
    level: "danger", title: "Há dinheiro parado em facturas vencidas",
    detail: `${totalOverdueInvoices} factura(s) têm saldo por receber. Faz o acompanhamento dos clientes antes de assumires novos compromissos.`,
    href: "/invoices",
  });
  if (totalOverdueBills > 0) recommendations.push({
    level: "warning", title: "Existem pagamentos a fornecedores em atraso",
    detail: `${totalOverdueBills} conta(s) de fornecedor passaram o vencimento. Confirma prioridades e evita penalizações.`,
    href: "/bills",
  });
  if (totalUpcomingInvoices > 0) recommendations.push({
    level: "info", title: "Prepara os recebimentos desta semana",
    detail: `${totalUpcomingInvoices} factura(s) vencem nos próximos sete dias. Um lembrete antecipado pode evitar atrasos.`,
    href: "/invoices",
  });
  if (totalUpcomingBills > 0) recommendations.push({
    level: "warning", title: "Planeia os pagamentos próximos",
    detail: `${totalUpcomingBills} conta(s) de fornecedor vencem nos próximos sete dias. Confirma que o caixa estará disponível.`,
    href: "/bills",
  });
  if (totalExpiringQuotes > 0) recommendations.push({
    level: "info", title: "Não deixes propostas perderem validade",
    detail: `${totalExpiringQuotes} orçamento(s) enviados expiram nos próximos sete dias. Contacta os clientes para acompanhar a decisão.`,
    href: "/quotes",
  });
  if (cashSummary.some(item => item.net?.lt(0))) recommendations.push({
    level: "warning", title: "As saídas superaram as entradas em pelo menos uma moeda",
    detail: "Nos últimos 30 dias, os pagamentos e despesas registados ultrapassaram os recebimentos em uma ou mais moedas. Revê os compromissos antes de aumentar os custos.",
    href: "/reports",
  });
  if (recommendations.length === 0) recommendations.push({
    level: "good", title: "Sem alertas prioritários identificados",
    detail: "Com os registos disponíveis, não encontrámos vencimentos ou propostas a exigir atenção imediata. Continua a actualizar pagamentos e despesas.",
    href: "/reports",
  });

  const levelStyle = {
    danger: "border-rose-300/20 bg-rose-400/[.06] text-rose-100",
    warning: "border-amber-300/20 bg-amber-300/[.05] text-amber-100",
    good: "border-emerald-300/20 bg-emerald-400/[.05] text-emerald-100",
    info: "border-sky-300/20 bg-sky-400/[.05] text-sky-100",
  };
  const currencyTotals = (rows: Array<{ currency: string; amount: ReturnType<typeof D>; count: number }>) =>
    rows.map(item => ({ ...item, label: money(item.amount, item.currency, locale) }));

  return <main className="mx-auto max-w-7xl space-y-7 pb-10">
    <header className="relative overflow-hidden rounded-3xl border border-indigo-300/15 bg-gradient-to-br from-[#1b2345] via-[#121c32] to-[#0b1424] p-6 sm:p-9">
      <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl"/>
      <div className="relative max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200/20 bg-indigo-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-100"><Sparkles size={13}/> Inteligência financeira</span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Não olhes apenas para os números. Percebe o que deves fazer a seguir.</h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">O InvoiceFlow analisa os teus registos de recebimentos, despesas, facturas, fornecedores e orçamentos para destacar riscos e próximas acções.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <span className="rounded-full bg-white/[.06] px-3 py-2 text-xs text-slate-300">Dados da tua empresa</span>
          <span className="rounded-full bg-white/[.06] px-3 py-2 text-xs text-slate-300">Moedas separadas</span>
          <span className="rounded-full bg-white/[.06] px-3 py-2 text-xs text-slate-300">Sem previsões inventadas</span>
        </div>
      </div>
    </header>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-rose-300/15 bg-rose-400/[.05] p-5"><div className="flex items-center gap-2 text-sm text-rose-200"><AlertTriangle size={16}/> Facturas vencidas</div><p className="mt-3 text-3xl font-semibold text-white">{totalOverdueInvoices}</p><p className="mt-1 text-xs text-slate-500">Documentos com saldo por receber</p></div>
      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-5"><div className="flex items-center gap-2 text-sm text-amber-100"><CalendarClock size={16}/> Contas vencidas</div><p className="mt-3 text-3xl font-semibold text-white">{totalOverdueBills}</p><p className="mt-1 text-xs text-slate-500">Obrigações a fornecedores</p></div>
      <div className="rounded-2xl border border-sky-300/15 bg-sky-400/[.04] p-5"><div className="flex items-center gap-2 text-sm text-sky-100"><ReceiptText size={16}/> Orçamentos a expirar</div><p className="mt-3 text-3xl font-semibold text-white">{totalExpiringQuotes}</p><p className="mt-1 text-xs text-slate-500">Propostas enviadas nos próximos 7 dias</p></div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"><div className="flex items-center gap-2 text-sm text-slate-300"><Activity size={16}/> Custos recorrentes</div><p className="mt-3 text-3xl font-semibold text-white">{totalRecurring}</p><p className="mt-1 text-xs text-slate-500">Despesas previstas nos próximos 30 dias</p></div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6">
        <div className="flex items-center gap-2"><Lightbulb size={18} className="text-amber-200"/><div><h2 className="font-semibold">O que merece a tua atenção</h2><p className="mt-1 text-xs text-slate-500">Recomendações baseadas em regras e dados registados</p></div></div>
        <div className="mt-5 space-y-3">
          {recommendations.map((item,index)=><article key={item.title} className={`rounded-xl border p-4 ${levelStyle[item.level]}`}>
            <div className="flex items-start gap-3"><span className="mt-0.5">{item.level==="danger"?<ShieldAlert size={18}/>:item.level==="warning"?<AlertTriangle size={18}/>:item.level==="good"?<CheckCircle2 size={18}/>:<Lightbulb size={18}/>}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-slate-300">{item.detail}</p><Link href={item.href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white hover:text-indigo-200">Ver e agir <ArrowRight size={13}/></Link></div></div>
          </article>)}
        </div>
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6">
          <div className="flex items-center gap-2"><Wallet size={18} className="text-emerald-200"/><div><h2 className="font-semibold">Movimento dos últimos 30 dias</h2><p className="mt-1 text-xs text-slate-500">Entradas menos saídas registadas, por moeda</p></div></div>
          <div className="mt-5 space-y-4">
            {cashSummary.length ? cashSummary.map(item=><div key={item.currency} className="rounded-xl border border-white/[.07] bg-white/[.025] p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-300">{item.currency}</span><span className={`text-sm font-semibold ${item.net && item.net.gte(0)?"text-emerald-200":"text-rose-200"}`}>{item.net ? money(item.net,item.currency,locale) : "Não calculado"}</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="text-slate-500">Recebido</p><p className="mt-1 text-slate-200">{money(item.received,item.currency,locale)}</p></div><div><p className="text-slate-500">Despesas</p><p className="mt-1 text-slate-200">{money(item.expenses,item.currency,locale)}</p></div><div><p className="text-slate-500">Fornecedores</p><p className="mt-1 text-slate-200">{supplierPaymentsComplete?money(item.suppliers,item.currency,locale):"—"}</p></div></div>
            </div>) : <p className="rounded-xl border border-white/[.07] p-4 text-sm text-slate-500">Ainda não existem movimentos suficientes nos últimos 30 dias.</p>}
          </div>
          {!supplierPaymentsComplete && <p className="mt-3 text-xs leading-5 text-amber-200">O volume de pagamentos a fornecedores ultrapassa o limite de leitura desta análise. O saldo líquido foi ocultado para não apresentar um resultado incompleto.</p>}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Isto é um resumo dos movimentos registados, não o saldo bancário. Não inclui movimentos fora do InvoiceFlow.</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6">
          <div className="flex items-center gap-2"><CircleDollarSign size={18} className="text-indigo-200"/><div><h2 className="font-semibold">Valores em atraso</h2><p className="mt-1 text-xs text-slate-500">Agrupados por moeda, sem conversões</p></div></div>
          <div className="mt-4 space-y-3">
            <div><p className="mb-2 text-xs font-semibold text-slate-400">Por receber de clientes</p>{currencyTotals(receivableRows).length?currencyTotals(receivableRows).map(x=><div key={x.currency} className="flex justify-between gap-3 py-1.5 text-sm"><span className="text-slate-400">{x.count} factura(s) · {x.currency}</span><strong>{x.label}</strong></div>):<p className="text-xs text-slate-500">Sem saldos vencidos.</p>}</div>
            <div className="border-t border-white/[.07] pt-3"><p className="mb-2 text-xs font-semibold text-slate-400">A pagar a fornecedores</p>{currencyTotals(payableRows).length?currencyTotals(payableRows).map(x=><div key={x.currency} className="flex justify-between gap-3 py-1.5 text-sm"><span className="text-slate-400">{x.count} conta(s) · {x.currency}</span><strong>{x.label}</strong></div>):<p className="text-xs text-slate-500">Sem contas vencidas.</p>}</div>
          </div>
        </section>
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6">
        <div className="flex items-center gap-2"><ArrowDownRight size={18} className="text-rose-200"/><div><h2 className="font-semibold">Recebimentos a preparar</h2><p className="mt-1 text-xs text-slate-500">Facturas que vencem nos próximos sete dias</p></div></div>
        <div className="mt-4 space-y-3">{upcomingInvoices.length?upcomingInvoices.map(item=><div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.07] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.client.name}</p><p className="mt-1 text-xs text-slate-500">{item.number||"Factura"} · {item.dueDate?dateLabel(item.dueDate,locale,timeZone):"Sem vencimento"}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold">{money(D(item.total).minus(item.amountPaid).gt(0)?D(item.total).minus(item.amountPaid):0,item.currency,locale)}</p><p className="text-[10px] text-slate-500">{item.currency}</p></div></div>):<p className="rounded-xl border border-white/[.07] p-4 text-sm text-slate-500">Nenhuma factura com vencimento nesta janela.</p>}</div>
        <Link href="/invoices" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-300">Ver facturas em aberto <ArrowRight size={13}/></Link>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6">
        <div className="flex items-center gap-2"><ArrowUpRight size={18} className="text-amber-200"/><div><h2 className="font-semibold">Compromissos próximos</h2><p className="mt-1 text-xs text-slate-500">Contas de fornecedores com vencimento nesta semana</p></div></div>
        <div className="mt-4 space-y-3">{upcomingBills.length?upcomingBills.map(item=><div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.07] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.supplier.name}</p><p className="mt-1 text-xs text-slate-500">{item.number||"Conta"} · {item.dueDate?dateLabel(item.dueDate,locale,timeZone):"Sem vencimento"}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold">{money(D(item.total).minus(item.amountPaid).gt(0)?D(item.total).minus(item.amountPaid):0,item.currency,locale)}</p><p className="text-[10px] text-slate-500">{item.currency}</p></div></div>):<p className="rounded-xl border border-white/[.07] p-4 text-sm text-slate-500">Nenhuma conta com vencimento nesta janela.</p>}</div>
        <Link href="/bills" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-300">Abrir contas a pagar <ArrowRight size={13}/></Link>
      </div>
    </section>

    <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6">
      <div className="flex items-center gap-2"><CalendarClock size={18} className="text-sky-200"/><div><h2 className="font-semibold">Orçamentos perto de expirar</h2><p className="mt-1 text-xs text-slate-500">Propostas enviadas com validade nos próximos sete dias</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{expiringQuotes.length?expiringQuotes.map(item=><div key={item.id} className="rounded-xl border border-white/[.07] p-4"><p className="text-sm font-semibold">{item.client.name}</p><p className="mt-1 text-xs text-slate-500">{item.number||item.title||"Orçamento"} · expira {item.validUntil?dateLabel(item.validUntil,locale,timeZone):"em breve"}</p><p className="mt-3 text-base font-semibold">{money(item.total,item.currency,locale)}</p><Link href={`/quotes/${item.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-300">Ver orçamento <ArrowRight size={13}/></Link></div>):<p className="text-sm text-slate-500">Não há propostas a expirar nos próximos sete dias.</p>}</div>
    </section>

    <p className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-xs leading-5 text-slate-500">As recomendações desta página são regras determinísticas aplicadas aos dados registados pela empresa. Não são previsões, aconselhamento contabilístico ou garantia de resultados. Mantém os registos actualizados e confirma cada decisão antes de agir.</p>
  </main>;
}
