import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Mail, CalendarClock, AlertTriangle, CheckCircle2, ArrowRight, ReceiptText } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatMoney, D } from "@/lib/money";

const DAY = 24 * 60 * 60 * 1000;
function phoneForWhatsApp(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  // wa.me requires an international number without a leading local trunk zero.
  return digits.length >= 10 && digits.length <= 15 && !digits.startsWith("0") ? digits : null;
}
function reminderText(client: string, invoice: string, balance: string, due: string, organization: string) {
  return [
    `Olá, ${client}.`,
    "",
    `Estamos a acompanhar a factura ${invoice}, que tem um saldo em aberto de ${balance} e cujo vencimento foi ${due}.`,
    "Poderia, por favor, confirmar a previsão de pagamento?",
    "Se já efectuou o pagamento, agradecemos que ignore esta mensagem e, se possível, envie o comprovativo.",
    "",
    "Obrigado,",
    organization,
  ].join("\n");
}

export default async function CollectionsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "invoices:read")) redirect("/dashboard");

  const organizationId = current.membership.organizationId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 7 * DAY);
  const [invoices, invoiceCount, organization] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { not: null, lte: horizon },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 200,
      select: {
        id: true, number: true, currency: true, total: true, amountPaid: true, dueDate: true,
        client: { select: { name: true, phone: true, email: true } },
      },
    }),
    prisma.invoice.count({
      where: {
        organizationId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { not: null, lte: horizon },
      },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  const items = invoices.flatMap(invoice => {
    if (!invoice.dueDate) return [];
    const balance = D(invoice.total).minus(invoice.amountPaid);
    if (!balance.gt(0)) return [];
    const dueDate = new Date(invoice.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const days = Math.round((dueDate.getTime() - today.getTime()) / DAY);
    const dueLabel = new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(invoice.dueDate);
    const balanceLabel = formatMoney(balance, invoice.currency, current.user.locale || "pt");
    const phone = phoneForWhatsApp(invoice.client.phone);
    const message = reminderText(invoice.client.name, invoice.number || invoice.id.slice(0, 8), balanceLabel, dueLabel, organization?.name || "A nossa equipa");
    const whatsapp = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;
    const emailSubject = `Lembrete de pagamento — factura ${invoice.number || ""}`;
    const emailBody = message;
    const email = invoice.client.email
      ? `mailto:${encodeURIComponent(invoice.client.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
      : null;
    return [{ id: invoice.id, number: invoice.number, client: invoice.client.name, phone: invoice.client.phone, emailAddress: invoice.client.email, currency: invoice.currency, balance: balanceLabel, dueLabel, days, whatsapp, email }];
  });

  const overdue = items.filter(item => item.days < 0);
  const upcoming = items.filter(item => item.days >= 0);
  const currencyTotals = Array.from(new Set(items.map(item => item.currency))).map(currency => ({
    currency,
    count: items.filter(item => item.currency === currency).length,
  }));

  function InvoiceCard({ item }: { item: typeof items[number] }) {
    const isLate = item.days < 0;
    return <article className="rounded-2xl border border-white/[.08] bg-[#101a2b]/80 p-4 transition hover:border-indigo-300/25 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.number || "Factura"}</p><h3 className="mt-1 truncate text-base font-semibold text-white">{item.client}</h3></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isLate ? "bg-rose-400/10 text-rose-200" : "bg-amber-300/10 text-amber-100"}`}>{isLate ? `${Math.abs(item.days)} dia(s) de atraso` : item.days === 0 ? "Vence hoje" : `Vence em ${item.days} dia(s)`}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs text-slate-500">Saldo por receber</p><p className="mt-1 text-xl font-semibold">{item.balance}</p><p className="mt-1 text-xs text-slate-500">Vencimento: {item.dueLabel}</p></div>
        <Link href={`/invoices/${item.id}`} className="text-xs font-semibold text-indigo-300 hover:text-white">Abrir factura <ArrowRight size={13} className="ml-1 inline"/></Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[.07] pt-4">
        {item.whatsapp ? <a href={item.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"><MessageCircle size={15}/> Preparar WhatsApp</a> : <span title="Adiciona o telefone do cliente com indicativo internacional, por exemplo +244." className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-slate-500"><MessageCircle size={15}/> WhatsApp indisponível</span>}
        {item.email ? <a href={item.email} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[.06]"><Mail size={15}/> Preparar e-mail</a> : <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-slate-500"><Mail size={15}/> Sem e-mail</span>}
      </div>
    </article>;
  }

  return <main className="mx-auto max-w-7xl space-y-7 pb-10">
    <header className="relative overflow-hidden rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-[#12312f] via-[#102331] to-[#10182b] p-6 sm:p-8">
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl"/>
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-100"><CalendarClock size={13}/> Gestão de recebimentos</span><h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Não deixes dinheiro esquecido em facturas vencidas.</h1><p className="mt-3 text-sm leading-7 text-slate-300">Vê o que está atrasado, acompanha os próximos vencimentos e prepara uma mensagem profissional para cobrar cada cliente sem sair do InvoiceFlow.</p></div>
        <Link href="/invoices" className="rounded-xl border border-white/15 bg-white/[.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Ver todas as facturas <ArrowRight size={15} className="ml-2 inline"/></Link>
      </div>
    </header>

    {invoiceCount > invoices.length && <p role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">A mostrar {invoices.length} de {invoiceCount} facturas com saldo e vencimento nesta janela. Refina o acompanhamento para consultar o restante.</p>}

    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-rose-300/15 bg-rose-400/[.05] p-5"><div className="flex items-center gap-2 text-sm text-rose-200"><AlertTriangle size={16}/> Em atraso</div><p className="mt-3 text-3xl font-semibold">{overdue.length}</p><p className="mt-1 text-xs text-slate-500">Facturas com saldo e vencimento ultrapassado</p></div>
      <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-5"><div className="flex items-center gap-2 text-sm text-amber-100"><CalendarClock size={16}/> Próximos 7 dias</div><p className="mt-3 text-3xl font-semibold">{upcoming.length}</p><p className="mt-1 text-xs text-slate-500">Vencimentos hoje ou nos próximos dias</p></div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"><div className="flex items-center gap-2 text-sm text-slate-300"><ReceiptText size={16}/> Moedas acompanhadas</div><p className="mt-3 text-3xl font-semibold">{currencyTotals.length}</p><p className="mt-1 text-xs text-slate-500">{currencyTotals.map(x => `${x.currency}: ${x.count}`).join(" · ") || "Sem saldos pendentes"}</p></div>
    </section>

    <section className="space-y-4">
      <div className="flex items-center gap-2"><AlertTriangle size={18} className="text-rose-300"/><div><h2 className="font-semibold">Precisam de atenção</h2><p className="text-xs text-slate-500">Facturas vencidas com saldo por receber</p></div></div>
      {overdue.length ? overdue.map(item => <InvoiceCard key={item.id} item={item}/>) : <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[.04] p-6"><div className="flex items-center gap-3"><CheckCircle2 size={20} className="text-emerald-300"/><div><p className="font-semibold text-emerald-100">Nenhuma factura vencida encontrada</p><p className="mt-1 text-sm text-slate-400">Bom sinal. Continua a acompanhar os próximos vencimentos.</p></div></div></div>}
    </section>

    <section className="space-y-4">
      <div className="flex items-center gap-2"><CalendarClock size={18} className="text-amber-200"/><div><h2 className="font-semibold">Vencem em breve</h2><p className="text-xs text-slate-500">Prepara o acompanhamento antes de passar o prazo</p></div></div>
      {upcoming.length ? upcoming.map(item => <InvoiceCard key={item.id} item={item}/>) : <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 text-sm text-slate-500">Não há facturas com vencimento nos próximos sete dias.</div>}
    </section>
    <p className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-xs leading-5 text-slate-500">As mensagens não são enviadas automaticamente. O InvoiceFlow prepara o texto e abre o WhatsApp ou o teu programa de e-mail para reveres e enviares. Os valores são apresentados por factura e por moeda, sem conversões.</p>
  </main>;
}
