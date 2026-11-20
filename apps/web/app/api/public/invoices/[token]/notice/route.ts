import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStrongPublicToken } from "@/lib/document-workflow";
import { balanceDue } from "@/lib/invoice-calc";
import { D } from "@/lib/money";

export const runtime = "nodejs";

const MAX_PENDING_PER_INVOICE = 5;

/** O cliente avisa que pagou. Não altera saldos: cria um aviso PENDENTE que a empresa tem de confirmar. Acesso por token imprevisível. */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const notFound = () => NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!isStrongPublicToken(token) || token.length > 128) return notFound();
  const body = await request.json().catch(() => null);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
  const payerName = str(body?.payerName, 120);
  const amountText = typeof body?.amount === "string" ? body.amount.trim().replace(",", ".") : "";
  const paidOn = str(body?.paidOn, 10);
  if (!payerName) return NextResponse.json({ error: "Indique o seu nome." }, { status: 400 });
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(amountText) || D(amountText).lte(0)) return NextResponse.json({ error: "Indique um valor positivo com, no máximo, duas casas decimais." }, { status: 400 });
  if (paidOn && (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn)))) return NextResponse.json({ error: "Data inválida." }, { status: 400 });

  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    select: { id: true, organizationId: true, type: true, status: true, total: true, amountPaid: true, organization: { select: { status: true } }, _count: { select: { paymentNotices: { where: { status: "PENDING" } } } } },
  });
  if (!invoice || invoice.status === "DRAFT" || invoice.status === "VOID" || invoice.organization.status !== "ACTIVE") return notFound();
  if (invoice.type !== "INVOICE") return NextResponse.json({ error: "Este documento não admite pagamentos." }, { status: 409 });
  const remaining = balanceDue(String(invoice.total), String(invoice.amountPaid));
  if (remaining.lte(0)) return NextResponse.json({ error: "Esta factura já está liquidada." }, { status: 409 });
  if (D(amountText).gt(remaining)) return NextResponse.json({ error: "O valor excede o saldo em aberto." }, { status: 400 });
  if (invoice._count.paymentNotices >= MAX_PENDING_PER_INVOICE) return NextResponse.json({ error: "Já existem avisos pendentes para esta factura. Aguarde a confirmação da empresa." }, { status: 429 });

  await prisma.paymentNotice.create({
    data: { organizationId: invoice.organizationId, invoiceId: invoice.id, payerName, amount: D(amountText).toFixed(2), paidOn, reference: str(body?.reference, 120), note: str(body?.note, 500) },
  });
  await prisma.invoiceEvent.create({ data: { invoiceId: invoice.id, action: "payment_notice_received", data: { amount: D(amountText).toFixed(2) } } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
