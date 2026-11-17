import IssueInvoiceButton from "./issue-button";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

export default async function InvoiceDetailPage({params}:{params:Promise<{id:string}>}) {
  const current=await getCurrentSession();if(!current)redirect("/login");if(!current.membership)redirect("/onboarding");
  if(!can(current.membership.role,"invoices:read"))redirect("/");
  const {id}=await params;
  const invoice=await prisma.invoice.findFirst({where:{id,organizationId:current.membership.organizationId},include:{client:true,organization:true,lines:{orderBy:{position:"asc"}}}});
  if(!invoice)notFound();
  const money=(v:unknown)=>new Intl.NumberFormat("pt-PT",{style:"currency",currency:invoice.currency}).format(Number(v));
  const labels:Record<string,string>={DRAFT:"Rascunho",ISSUED:"Emitida",PARTIALLY_PAID:"Parcialmente paga",PAID:"Paga",OVERDUE:"Vencida",VOID:"Anulada"};
  const issueAllowed=invoice.status==="DRAFT"&&can(current.membership.role,"invoices:send");
  return <main className="min-h-screen px-5 py-8 sm:px-8"><div className="mx-auto max-w-5xl"><Link href="/invoices" className="text-sm text-indigo-300">← Facturas</Link>
    <header className="my-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-slate-500">{invoice.number||"DOCUMENTO EM RASCUNHO"}</p><h1 className="mt-2 text-3xl font-semibold">{invoice.client.company||invoice.client.name}</h1><p className="mt-2 text-sm text-slate-400">{labels[invoice.status]} · {invoice.currency}</p></div><div className="flex flex-wrap gap-2">{invoice.status!=="DRAFT"&&<a href={`/api/invoices/${id}/pdf`} target="_blank" className="rounded-xl border border-white/10 px-4 py-3 text-sm">Ver PDF</a>}{issueAllowed&&<IssueInvoiceButton id={id} />}</div></header>
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-8"><div className="grid gap-6 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-wider text-slate-500">Emitido por</p><p className="mt-2 font-semibold">{invoice.organization.legalName||invoice.organization.name}</p><p className="mt-1 text-sm text-slate-400">{invoice.organization.taxId||"NIF não definido"}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-500">Cliente</p><p className="mt-2 font-semibold">{invoice.client.company||invoice.client.name}</p><p className="mt-1 text-sm text-slate-400">{invoice.client.taxId||""}</p><p className="text-sm text-slate-400">{invoice.client.email||""}</p></div></div>
    <div className="mt-8 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-slate-500"><tr><th className="py-3">Descrição</th><th className="py-3 text-right">Qtd.</th><th className="py-3 text-right">Preço</th><th className="py-3 text-right">Desc.</th><th className="py-3 text-right">Imposto</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{invoice.lines.map(line=><tr key={line.id} className="border-b border-white/[.06]"><td className="py-4">{line.description}</td><td className="py-4 text-right">{Number(line.quantity)}</td><td className="py-4 text-right">{money(line.unitPrice)}</td><td className="py-4 text-right">{Number(line.discountPercent)}%</td><td className="py-4 text-right">{line.taxName||"—"} ({Number(line.taxRate)}%)</td><td className="py-4 text-right font-medium">{money(line.lineTotal)}</td></tr>)}</tbody></table></div>
    <div className="ml-auto mt-6 max-w-sm space-y-3 text-sm"><div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div><div className="flex justify-between text-slate-400"><span>Descontos</span><span>- {money(invoice.discountTotal)}</span></div><div className="flex justify-between text-slate-400"><span>Impostos</span><span>{money(invoice.taxTotal)}</span></div><div className="flex justify-between text-slate-400"><span>Retenção</span><span>- {money(invoice.withholdingTotal)}</span></div><div className="flex justify-between border-t border-white/10 pt-4 text-lg font-semibold"><span>Total</span><span>{money(invoice.total)}</span></div></div>
    {invoice.notes&&<div className="mt-8 border-t border-white/10 pt-5"><p className="text-xs uppercase tracking-wider text-slate-500">Notas</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{invoice.notes}</p></div>}
    </section><p className="mt-4 text-xs text-slate-600">Criada em {new Intl.DateTimeFormat("pt-PT",{dateStyle:"medium",timeStyle:"short"}).format(invoice.createdAt)}</p>
  </div></main>;
}
