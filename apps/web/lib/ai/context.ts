import { prisma } from "@/lib/db";
import { D, formatMoney } from "@/lib/money";

const DAY = 24 * 60 * 60 * 1000;
const OPEN_INVOICES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;
const OPEN_BILLS = ["OPEN", "PARTIALLY_PAID"] as const;

/** Read-only financial snapshot of one organization, rendered as plain text for the model. */
export async function buildFinancialContext(organizationId: string, orgName: string, baseCurrency: string) {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const in14 = new Date(today.getTime() + 14 * DAY);
  const money = (v: unknown, c: string) => formatMoney(D(v as string | number), c, "pt");
  const open = (rows: { currency: string; _sum: { total: unknown; amountPaid: unknown }; _count: { _all: number } }[]) =>
    rows.length ? rows.map(r => `${money(D(r._sum.total as string).minus((r._sum.amountPaid as string) ?? 0), r.currency)} (${r._count._all})`).join("; ") : "nenhum";

  const [clients, receivable, overdue, payable, overduePay, cashIn, expenses, overdueList, dueSoon, billsSoon] = await Promise.all([
    prisma.client.count({ where: { organizationId, archivedAt: null } }),
    prisma.invoice.groupBy({ by: ["currency"], where: { organizationId, status: { in: [...OPEN_INVOICES] } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ["currency"], where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { lt: today } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
    prisma.bill.groupBy({ by: ["currency"], where: { organizationId, status: { in: [...OPEN_BILLS] } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
    prisma.bill.groupBy({ by: ["currency"], where: { organizationId, status: { in: [...OPEN_BILLS] }, dueDate: { lt: today } }, _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["currency"], where: { organizationId, status: "CONFIRMED", receivedAt: { gte: d30 } }, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["currency"], where: { organizationId, status: "PAID", date: { gte: d30 } }, _sum: { amount: true } }),
    prisma.invoice.findMany({ where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { lt: today } }, orderBy: { dueDate: "asc" }, take: 10,
      select: { number: true, currency: true, total: true, amountPaid: true, dueDate: true, client: { select: { name: true, phone: true, email: true } } } }),
    prisma.invoice.findMany({ where: { organizationId, status: { in: [...OPEN_INVOICES] }, dueDate: { gte: today, lte: in14 } }, orderBy: { dueDate: "asc" }, take: 8,
      select: { number: true, currency: true, total: true, amountPaid: true, dueDate: true, client: { select: { name: true } } } }),
    prisma.bill.findMany({ where: { organizationId, status: { in: [...OPEN_BILLS] }, dueDate: { lte: in14 } }, orderBy: { dueDate: "asc" }, take: 8,
      select: { number: true, currency: true, total: true, amountPaid: true, dueDate: true, supplier: { select: { name: true } } } }),
  ]);

  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "sem data");
  const left = (x: { total: unknown; amountPaid: unknown; currency: string }) => money(D(x.total as string).minus(x.amountPaid as string), x.currency);
  const lines = [
    `Empresa: ${orgName}. Moeda base: ${baseCurrency}. Data de hoje: ${day(today)}.`,
    `Clientes activos: ${clients}.`,
    `A receber (facturas em aberto): ${open(receivable)}.`,
    `Em atraso (a receber): ${open(overdue)}.`,
    `A pagar (contas de fornecedores): ${open(payable)}.`,
    `Em atraso (a pagar): ${open(overduePay)}.`,
    `Recebido nos últimos 30 dias: ${cashIn.length ? cashIn.map(r => money(r._sum.amount, r.currency)).join("; ") : "nada"}.`,
    `Despesas pagas nos últimos 30 dias: ${expenses.length ? expenses.map(r => money(r._sum.amount, r.currency)).join("; ") : "nada"}.`,
    `Facturas em atraso (até 10):`,
    ...(overdueList.length ? overdueList.map(i => `- ${i.number ?? "s/n"} | ${i.client?.name ?? "?"} | falta ${left(i)} | venceu ${day(i.dueDate)} | contacto ${i.client?.phone || i.client?.email || "n/d"}`) : ["- nenhuma"]),
    `Facturas a vencer nos próximos 14 dias:`,
    ...(dueSoon.length ? dueSoon.map(i => `- ${i.number ?? "s/n"} | ${i.client?.name ?? "?"} | falta ${left(i)} | vence ${day(i.dueDate)}`) : ["- nenhuma"]),
    `Contas a pagar a vencer ou vencidas (14 dias):`,
    ...(billsSoon.length ? billsSoon.map(b => `- ${b.number ?? "s/n"} | ${b.supplier?.name ?? "?"} | falta ${left(b)} | vence ${day(b.dueDate)}`) : ["- nenhuma"]),
  ];
  return lines.join("\n");
}
