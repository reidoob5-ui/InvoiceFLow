import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isStrongPublicToken } from "@/lib/document-workflow";
import { balanceDue } from "@/lib/invoice-calc";
import { formatDate, formatMoney } from "@/lib/money";
import NoticeForm from "./notice-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Factura", robots: { index: false, follow: false }, referrer: "no-referrer" };

const STATUS: Record<string, [string, string]> = {
  ISSUED: ["Por pagar", "text-amber-300"], SENT: ["Por pagar", "text-amber-300"], VIEWED: ["Por pagar", "text-amber-300"],
  PARTIAL: ["Pago parcialmente", "text-amber-300"], PAID: ["Pago", "text-emerald-300"], OVERDUE: ["Em atraso", "text-rose-300"],
};

/** Portal público do cliente: factura, saldo, instruções de pagamento e aviso de pagamento. Acesso por token imprevisível. */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isStrongPublicToken(token) || token.length > 128) notFound();
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: { client: true, organization: true, lines: { orderBy: { position: "asc" } }, paymentNotices: { where: { status: "PENDING" }, select: { id: true, amount: true } } },
  });
  if (!invoice || invoice.status === "DRAFT" || invoice.status === "VOID" || invoice.organization.status !== "ACTIVE") notFound();

  const locale = invoice.organization.locale;
  const money = (v: unknown) => formatMoney(String(v), invoice.currency, locale);
  const isCredit = invoice.type === "CREDIT_NOTE";
  const balance = isCredit ? balanceDue("0", "0") : balanceDue(String(invoice.total), String(invoice.amountPaid));
  const [label, tone] = STATUS[invoice.status] ?? [invoice.status, "text-slate-300"];
  const org = invoice.organization;
  const payable = !isCredit && balance.gt(0);

  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
    <header>
      <p className="text-xs uppercase tracking-widest text-slate-500">{org.legalName || org.name}</p>
      <h1 className="mt-2 text-3xl font-semibold">{isCredit ? "Nota de crédito" : "Factura"} {invoice.number}</h1>
      <p className="mt-2 text-sm text-slate-400">Para {invoice.client.company || invoice.client.name}{invoice.issueDate ? ` · emitida a ${formatDate(invoice.issueDate, locale)}` : ""}{invoice.dueDate && !isCredit ? ` · vence a ${formatDate(invoice.dueDate, locale)}` : ""}</p>
    </header>

    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div><p className="text-xs text-slate-500">{payable ? "Valor em aberto" : "Total"}</p><p className="mt-1 text-3xl font-semibold">{money(payable ? balance.toFixed(2) : invoice.total)}</p></div>
        {!isCredit && <span className={`text-sm font-medium ${tone}`}>{label}</span>}
      </div>
      <a href={`/api/public/invoices/${token}/pdf`} target="_blank" rel="noopener" className="mt-4 inline-block rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium">Descarregar PDF</a>
    </section>

    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="font-semibold">Detalhe</h2>
      <div className="mt-3 divide-y divide-white/[.06] text-sm">
        {invoice.lines.map((l) => <div key={l.id} className="flex justify-between gap-3 py-2"><span className="text-slate-300">{l.description} <span className="text-slate-500">× {String(l.quantity)}</span></span><span>{money(l.lineTotal)}</span></div>)}
      </div>
      <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm text-slate-400">
        <div className="flex justify-between"><span>IVA / impostos</span><span>{money(invoice.taxTotal)}</span></div>
        <div className="flex justify-between font-semibold text-white"><span>Total</span><span>{money(invoice.total)}</span></div>
      </div>
    </section>

    {payable && <section className="rounded-2xl border border-emerald-300/20 bg-emerald-400/[.05] p-5">
      <h2 className="font-semibold">Como pagar</h2>
      {org.paymentInstructions
        ? <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-200">{org.paymentInstructions}</pre>
        : <p className="mt-3 text-sm text-slate-400">A empresa ainda não indicou os dados de pagamento. Contacte-a{org.email ? ` em ${org.email}` : ""}{org.phone ? ` ou ${org.phone}` : ""}.</p>}
      <p className="mt-3 text-xs text-slate-500">Use «{invoice.number}» como referência do pagamento.</p>
    </section>}

    {payable && <NoticeForm token={token} balance={balance.toFixed(2)} currency={invoice.currency} defaultName={invoice.client.company || invoice.client.name} pending={invoice.paymentNotices.length} />}
    <p className="pt-2 text-center text-xs text-slate-600">Emitido com InvoiceFlow</p>
  </main>;
}
