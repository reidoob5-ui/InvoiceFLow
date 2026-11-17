import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

const labels: Record<string, string> = { DRAFT: "Rascunho", ISSUED: "Emitida", PARTIALLY_PAID: "Parcialmente paga", PAID: "Paga", OVERDUE: "Vencida", VOID: "Anulada" };
const styles: Record<string, string> = { DRAFT: "text-slate-300 bg-slate-500/15", ISSUED: "text-blue-300 bg-blue-500/15", PARTIALLY_PAID: "text-amber-300 bg-amber-500/15", PAID: "text-emerald-300 bg-emerald-500/15", OVERDUE: "text-rose-300 bg-rose-500/15", VOID: "text-slate-500 bg-slate-500/10" };

export default async function InvoicesPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "invoices:read")) redirect("/");
  const organizationId = current.membership.organizationId;
  const [invoices, currency] = await Promise.all([
    prisma.invoice.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, number: true, status: true, currency: true, total: true, amountPaid: true, issueDate: true, dueDate: true, createdAt: true, client: { select: { name: true } } } }),
    Promise.resolve(current.membership.organization.currency),
  ]);
  const money = (value: unknown, code: string) => new Intl.NumberFormat(current.user.locale === "pt" ? "pt-PT" : "en-US", { style: "currency", currency: code || currency }).format(Number(value));
  return <main className="min-h-screen px-5 py-8 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <Link href="/" className="text-sm text-indigo-300">← Dashboard</Link>
      <header className="my-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold">Facturas</h1><p className="mt-2 text-sm text-slate-400">Cria, emite e acompanha os documentos dos teus clientes.</p></div>{can(current.membership.role, "invoices:write") && <Link href="/invoices/new" className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold">+ Nova factura</Link>}</header>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-white/[.03] text-xs text-slate-500"><tr><th className="px-5 py-4">Número</th><th className="px-5 py-4">Cliente</th><th className="px-5 py-4">Emissão</th><th className="px-5 py-4">Vencimento</th><th className="px-5 py-4">Total</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4">Acção</th></tr></thead><tbody>{invoices.map(invoice=><tr key={invoice.id} className="border-t border-white/[.06]"><td className="px-5 py-4 font-semibold">{invoice.number || "—"}</td><td className="px-5 py-4 text-slate-300">{invoice.client.name}</td><td className="px-5 py-4 text-slate-400">{invoice.issueDate ? new Intl.DateTimeFormat("pt-PT").format(invoice.issueDate) : "—"}</td><td className="px-5 py-4 text-slate-400">{invoice.dueDate ? new Intl.DateTimeFormat("pt-PT").format(invoice.dueDate) : "—"}</td><td className="px-5 py-4 font-medium">{money(invoice.total, invoice.currency)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${styles[invoice.status] || ""}`}>{labels[invoice.status] || invoice.status}</span></td><td className="px-5 py-4"><Link href={`/invoices/${invoice.id}`} className="text-indigo-300 hover:text-indigo-200">Abrir →</Link></td></tr>)}</tbody></table></div>
        {invoices.length===0 && <div className="p-14 text-center"><p className="font-medium">Ainda não existem facturas</p><p className="mt-2 text-sm text-slate-500">Cria a primeira factura para começares a acompanhar os recebimentos.</p><Link href="/invoices/new" className="mt-5 inline-block rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold">Criar factura</Link></div>}
      </div>
    </div>
  </main>;
}
