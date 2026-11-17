import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import EditInvoiceForm from "./edit-form";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "invoices:write")) redirect("/");
  const { id } = await params;
  const [invoice, taxes] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, organizationId: current.membership.organizationId, status: "DRAFT" },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    prisma.taxRate.findMany({ where: { organizationId: current.membership.organizationId, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!invoice) notFound();
  return <main className="min-h-screen px-5 py-8 sm:px-8"><div className="mx-auto max-w-5xl">
    <Link href={`/invoices/${id}`} className="text-sm text-indigo-300">← Voltar à factura</Link>
    <header className="my-6"><h1 className="text-3xl font-semibold">Editar rascunho</h1><p className="mt-2 text-sm text-slate-400">Só podes alterar facturas que ainda não foram emitidas.</p></header>
    <EditInvoiceForm invoice={{
      id: invoice.id, clientId: invoice.clientId, currency: invoice.currency,
      paymentTermsDays: invoice.paymentTermsDays, withholdingRate: Number(invoice.withholdingRate),
      notes: invoice.notes ?? "", terms: invoice.terms ?? "",
      lines: invoice.lines.map(line => ({
        productId: line.productId ?? "", description: line.description,
        quantity: String(line.quantity), unitPrice: String(line.unitPrice),
        discountPercent: String(line.discountPercent),
        taxRateId: taxes.find(t => t.name === line.taxName && Number(t.rate) === Number(line.taxRate))?.id ?? "",
      })),
    }} />
  </div></main>;
}
