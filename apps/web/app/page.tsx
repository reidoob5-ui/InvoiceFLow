import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
}

export default async function Home() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");

  const membership = current.membership;
  const organizationId = membership.organizationId;
  const currency = membership.organization.currency || "USD";
  const [totals, clientCount, paidCount, recentInvoices, sixMonthInvoices] = await Promise.all([
    prisma.invoice.aggregate({
      where: { organizationId, status: { not: "VOID" } },
      _sum: { total: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.client.count({ where: { organizationId, archivedAt: null } }),
    prisma.invoice.count({ where: { organizationId, status: "PAID" } }),
    prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, number: true, total: true, currency: true, status: true, createdAt: true, client: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { organizationId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) }, status: { not: "VOID" } },
      select: { total: true, createdAt: true },
    }),
  ]);

  const revenue = Number(totals._sum.amountPaid ?? 0);
  const outstanding = Math.max(0, Number(totals._sum.total ?? 0) - revenue);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index));
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: new Intl.DateTimeFormat("pt", { month: "short" }).format(date), amount: 0 };
  });
  for (const invoice of sixMonthInvoices) {
    const key = `${invoice.createdAt.getFullYear()}-${invoice.createdAt.getMonth()}`;
    const month = months.find((item) => item.key === key);
    if (month) month.amount += Number(invoice.total);
  }
  const maxMonth = Math.max(1, ...months.map((month) => month.amount));
  const statusLabel: Record<string, string> = { DRAFT: "Rascunho", ISSUED: "Emitida", PARTIALLY_PAID: "Parcial", PAID: "Paga", OVERDUE: "Vencida", VOID: "Anulada" };

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden border-r border-white/10 bg-slate-950/40 p-6 lg:flex lg:flex-col">
        <div className="mb-12 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-lg font-black">I</div><div><div className="text-lg font-semibold tracking-tight">InvoiceFlow</div><div className="text-xs text-slate-500">FINANCE WORKSPACE</div></div></div>
        <div className="mb-3 text-[10px] font-semibold tracking-[.2em] text-slate-500">ESPAÇO DE TRABALHO</div>
        <nav className="space-y-2 text-sm">
          <a className="flex items-center gap-3 rounded-xl bg-indigo-500/15 px-4 py-3 font-medium text-indigo-200" href="/">Visão geral</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="/invoices">Facturas</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="/clients">Clientes</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="/products">Produtos e serviços</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="/expenses">Despesas</a>
        </nav>
        <div className="mt-auto rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4"><div className="mb-2 text-sm font-semibold">{membership.organization.name}</div><p className="text-xs leading-5 text-slate-400">{current.user.email}</p><form action="/api/auth/logout" method="post" className="mt-4"><button className="text-xs text-indigo-300 hover:text-indigo-200">Terminar sessão</button></form></div>
      </aside>
      <section className="mx-auto w-full max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-slate-500">{new Intl.DateTimeFormat("pt-PT", { dateStyle: "full" }).format(new Date())}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Olá, {current.user.name || current.user.email.split("@")[0]}</h1><p className="mt-2 text-sm text-slate-400">Resumo financeiro de {membership.organization.name}.</p></div><a href="/invoices/new" className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-indigo-950/40 hover:bg-indigo-400">+ Criar factura</a></header>
        <div className="mb-6"><h2 className="text-lg font-semibold">Visão financeira</h2><p className="mt-1 text-xs text-slate-500">Valores calculados a partir dos registos da tua empresa.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[{label:"Recebido",value:money(revenue,currency)},{label:"Por receber",value:money(outstanding,currency)},{label:"Clientes activos",value:String(clientCount)},{label:"Facturas pagas",value:String(paidCount)}].map((item)=><div key={item.label} className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-black/10"><div className="text-sm text-slate-400">{item.label}</div><div className="mt-5 text-2xl font-semibold tracking-tight">{item.value}</div><div className="mt-2 text-xs text-slate-500">Dados reais · {membership.organization.name}</div></div>)}
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6"><h3 className="font-semibold">Facturação recente</h3><p className="mt-1 text-xs text-slate-500">Total de documentos criados nos últimos seis meses</p><div className="mt-8 flex h-48 items-end gap-3">{months.map((month)=><div key={month.key} className="flex h-full flex-1 flex-col justify-end"><div title={money(month.amount,currency)} className="w-full rounded-t-md bg-gradient-to-t from-indigo-600/60 to-indigo-400" style={{height:`${Math.max(3,month.amount/maxMonth*100)}%`}}/><span className="mt-3 text-center text-[10px] text-slate-500">{month.label}</span></div>)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6"><h3 className="font-semibold">A tua empresa</h3><p className="mt-1 text-xs text-slate-500">Espaço de trabalho activo</p><div className="mt-6"><div className="text-xl font-semibold">{membership.organization.name}</div><div className="mt-2 text-sm text-slate-400">{membership.role}</div><div className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-slate-500">Moeda principal: {currency}</div></div></div>
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/65"><div className="border-b border-white/10 p-5"><h3 className="font-semibold">Facturas recentes</h3><p className="mt-1 text-xs text-slate-500">Os últimos documentos da empresa</p></div>
          {recentInvoices.length===0?<div className="p-8 text-center"><p className="font-medium">Ainda não existem facturas</p><p className="mt-2 text-sm text-slate-500">Quando criares documentos, eles aparecerão aqui.</p></div>:<div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">Documento</th><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Total</th><th className="px-5 py-3 font-medium">Estado</th></tr></thead><tbody>{recentInvoices.map((invoice)=><tr key={invoice.id} className="border-t border-white/[.06]"><td className="px-5 py-4 font-medium text-slate-200">{invoice.number || "Rascunho"}</td><td className="px-5 py-4 text-slate-400">{invoice.client.name}</td><td className="px-5 py-4 text-slate-500">{new Intl.DateTimeFormat("pt-PT").format(invoice.createdAt)}</td><td className="px-5 py-4 font-medium">{money(Number(invoice.total),invoice.currency || currency)}</td><td className="px-5 py-4 text-slate-300">{statusLabel[invoice.status] || invoice.status}</td></tr>)}</tbody></table></div>}
        </div>
        <p className="mt-8 text-center text-[11px] text-slate-600">InvoiceFlow · Dados da empresa autenticada e isolada por organização</p>
      </section>
    </main>
  );
}
