import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { D, formatMoney } from "@/lib/money";

function groupedMoney(rows: { currency: string; amount: unknown }[]) {
  return rows.filter(row => D(row.amount as string).gt(0)).map(row => formatMoney(row.amount as string, row.currency, "pt"));
}

export default async function Home() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");

  const membership = current.membership;
  const organizationId = membership.organizationId;
  const currency = membership.organization.currency || "AOA";
  const start = new Date(); start.setDate(1); start.setMonth(start.getMonth() - 5); start.setHours(0, 0, 0, 0);
  const [clients, paidInvoices, received, receivables, expenses, bills, recentInvoices, issuedInvoices] = await Promise.all([
    prisma.client.count({ where: { organizationId, archivedAt: null } }),
    prisma.invoice.count({ where: { organizationId, type: "INVOICE", status: "PAID" } }),
    prisma.payment.groupBy({ by: ["currency"], where: { organizationId, status: "CONFIRMED" }, _sum: { amount: true } }),
    prisma.invoice.groupBy({ by: ["currency"], where: { organizationId, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, _sum: { total: true, amountPaid: true } }),
    prisma.expense.groupBy({ by: ["currency"], where: { organizationId, status: "PAID" }, _sum: { amount: true } }),
    prisma.bill.groupBy({ by: ["currency"], where: { organizationId, status: { in: ["OPEN", "PARTIALLY_PAID"] } }, _sum: { total: true, amountPaid: true } }),
    prisma.invoice.findMany({
      where: { organizationId }, orderBy: [{ createdAt: "desc" }], take: 6,
      select: { id: true, number: true, total: true, currency: true, status: true, createdAt: true, client: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { organizationId, issueDate: { gte: start }, status: { notIn: ["DRAFT", "VOID"] } },
      select: { issueDate: true },
    }),
  ]);

  const receivedRows = received.map(x => ({ currency: x.currency, amount: x._sum.amount ?? 0 }));
  const receivableRows = receivables.map(x => ({ currency: x.currency, amount: D(x._sum.total).minus(x._sum.amountPaid ?? 0).toFixed(2) }));
  const expenseRows = expenses.map(x => ({ currency: x.currency, amount: x._sum.amount ?? 0 }));
  const payableRows = bills.map(x => ({ currency: x.currency, amount: D(x._sum.total).minus(x._sum.amountPaid ?? 0).toFixed(2) }));

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setDate(1); date.setHours(0, 0, 0, 0); date.setMonth(date.getMonth() - (5 - index));
    return { key: date.getFullYear() + "-" + date.getMonth(), label: new Intl.DateTimeFormat("pt", { month: "short" }).format(date), count: 0 };
  });
  for (const invoice of issuedInvoices) {
    if (!invoice.issueDate) continue;
    const key = invoice.issueDate.getFullYear() + "-" + invoice.issueDate.getMonth();
    const month = months.find(item => item.key === key);
    if (month) month.count += 1;
  }
  const maxMonth = Math.max(1, ...months.map(month => month.count));
  const statusLabel: Record<string, string> = { DRAFT: "Rascunho", ISSUED: "Emitida", PARTIALLY_PAID: "Parcial", PAID: "Paga", OVERDUE: "Vencida", VOID: "Anulada" };
  const metrics = [
    { label: "Recebido", values: groupedMoney(receivedRows), hint: "Pagamentos confirmados" },
    { label: "Por receber", values: groupedMoney(receivableRows), hint: "Facturas emitidas em aberto" },
    { label: "Despesas pagas", values: groupedMoney(expenseRows), hint: "Despesas registadas como pagas" },
    { label: "A pagar a fornecedores", values: groupedMoney(payableRows), hint: "Facturas de fornecedores em aberto" },
  ];

  return (
    <main className="min-h-screen">
      <section className="mx-auto w-full max-w-[1500px] py-7">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm text-slate-500">{new Intl.DateTimeFormat("pt-PT", { dateStyle: "full" }).format(new Date())}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Olá, {current.user.name || current.user.email.split("@")[0]}</h1><p className="mt-2 text-sm text-slate-400">Resumo financeiro de {membership.organization.name}.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/bills" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/5">Contas a pagar</Link><Link href="/invoices/new" className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-indigo-950/40 hover:bg-indigo-400">+ Criar factura</Link></div>
        </header>
        <div className="mb-6"><h2 className="text-lg font-semibold">Visão financeira</h2><p className="mt-1 text-xs text-slate-500">Valores reais agrupados por moeda. Não somamos moedas diferentes.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(item=><div key={item.label} className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-black/10"><div className="text-sm text-slate-400">{item.label}</div><div className="mt-4 space-y-1">{item.values.length?item.values.map(value=><div key={value} className="text-xl font-semibold tracking-tight">{value}</div>):<div className="text-2xl font-semibold">—</div>}</div><div className="mt-3 text-xs text-slate-500">{item.hint}</div></div>)}
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6"><h3 className="font-semibold">Facturas emitidas</h3><p className="mt-1 text-xs text-slate-500">Quantidade de documentos emitidos nos últimos seis meses</p><div className="mt-8 flex h-48 items-end gap-3">{months.map(month=><div key={month.key} className="flex h-full flex-1 flex-col justify-end"><div title={String(month.count)+" facturas"} className="w-full rounded-t-md bg-gradient-to-t from-indigo-600/60 to-indigo-400" style={{height:`${Math.max(3,month.count/maxMonth*100)}%`}}/><span className="mt-3 text-center text-[10px] text-slate-500">{month.label}</span><span className="text-center text-[10px] text-slate-400">{month.count}</span></div>)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6"><h3 className="font-semibold">A tua empresa</h3><p className="mt-1 text-xs text-slate-500">Espaço de trabalho activo</p><div className="mt-6"><div className="text-xl font-semibold">{membership.organization.name}</div><div className="mt-2 text-sm text-slate-400">Perfil: {membership.role}</div><div className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-slate-500">Moeda principal: {currency}</div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/[.03] p-3"><div className="text-xs text-slate-500">Clientes activos</div><div className="mt-1 text-xl font-semibold">{clients}</div></div><div className="rounded-xl bg-white/[.03] p-3"><div className="text-xs text-slate-500">Facturas pagas</div><div className="mt-1 text-xl font-semibold">{paidInvoices}</div></div></div></div></div>
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/65"><div className="border-b border-white/10 p-5"><h3 className="font-semibold">Facturas recentes</h3><p className="mt-1 text-xs text-slate-500">Os últimos documentos da empresa</p></div>
          {recentInvoices.length===0?<div className="p-8 text-center"><p className="font-medium">Ainda não existem facturas</p><p className="mt-2 text-sm text-slate-500">Quando criares documentos, eles aparecerão aqui.</p></div>:<div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">Documento</th><th className="px-5 py-3 font-medium">Cliente</th><th className="px-5 py-3 font-medium">Data</th><th className="px-5 py-3 font-medium">Total</th><th className="px-5 py-3 font-medium">Estado</th></tr></thead><tbody>{recentInvoices.map(invoice=><tr key={invoice.id} className="border-t border-white/[.06]"><td className="px-5 py-4 font-medium text-slate-200">{invoice.number||"Rascunho"}</td><td className="px-5 py-4 text-slate-400">{invoice.client.name}</td><td className="px-5 py-4 text-slate-500">{new Intl.DateTimeFormat("pt-PT").format(invoice.createdAt)}</td><td className="px-5 py-4 font-medium">{formatMoney(invoice.total,invoice.currency||currency,"pt")}</td><td className="px-5 py-4 text-slate-300">{statusLabel[invoice.status]||invoice.status}</td></tr>)}</tbody></table></div>}
        </div>
        <p className="mt-8 text-center text-[11px] text-slate-600">InvoiceFlow · Dados da empresa autenticada e isolada por organização</p>
      </section>
    </main>
  );
}
