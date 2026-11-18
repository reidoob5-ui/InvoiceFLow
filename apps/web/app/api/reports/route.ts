import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { D } from "@/lib/money";

export const runtime = "nodejs";

type MoneyRow = { currency: string; amount: string };
type MonthRow = { month: string; currency: string; inflows: string; outflows: string };

function dateParam(value: string | null, end = false): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + (end ? "T23:59:59.999Z" : "T00:00:00.000Z"));
  // JavaScript normalizes impossible dates (for example, February 31) into the next month.
  // Reject those instead of silently running a report for a different period.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function add(map: Map<string, ReturnType<typeof D>>, currency: string, amount: unknown) {
  const key = currency.toUpperCase();
  map.set(key, (map.get(key) ?? D(0)).plus(D(amount ?? 0)));
}

export async function GET(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try {
    assertCan(current.membership.role, "reports:read");
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para consultar relatórios." }, { status: 403 });
    throw error;
  }

  const organizationId = current.membership.organizationId;
  const params = request.nextUrl.searchParams;
  const from = dateParam(params.get("from"));
  const to = dateParam(params.get("to"), true);
  if ((params.has("from") && !from) || (params.has("to") && !to)) {
    return NextResponse.json({ error: "Período inválido. Usa o formato AAAA-MM-DD." }, { status: 400 });
  }
  if (from && to && from > to) return NextResponse.json({ error: "A data inicial não pode ser posterior à data final." }, { status: 400 });

  const paymentDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  // The report queries below intentionally cap returned rows to protect the database.
  // Never present capped data as a complete financial report: ask the user to narrow the period.
  const [paymentCount, expenseCount, billPaymentCount, invoiceCount, billCount] = await Promise.all([
    prisma.payment.count({ where: { organizationId, status: "CONFIRMED", receivedAt: paymentDate } }),
    prisma.expense.count({ where: { organizationId, status: "PAID", billId: null, date: paymentDate } }),
    prisma.billPayment.count({ where: { organizationId, paidAt: paymentDate } }),
    prisma.invoice.count({ where: { organizationId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      ...(to ? { issueDate: { lte: to } } : {}), ...(from ? { issueDate: { gte: from } } : {}) } }),
    prisma.bill.count({ where: { organizationId, status: { in: ["OPEN", "PARTIALLY_PAID"] },
      ...(to ? { issueDate: { lte: to } } : {}), ...(from ? { issueDate: { gte: from } } : {}) } }),
  ]);
  const rowLimits = { payments: 5000, expenses: 5000, supplierPayments: 5000, invoices: 2000, bills: 2000 };
  const rowCounts = { payments: paymentCount, expenses: expenseCount, supplierPayments: billPaymentCount, invoices: invoiceCount, bills: billCount };
  const exceeded = Object.entries(rowLimits).filter(([key, limit]) => rowCounts[key as keyof typeof rowCounts] > limit);
  if (exceeded.length) {
    return NextResponse.json({
      error: "O período seleccionado contém demasiados registos para um relatório completo. Reduz o intervalo de datas e tenta novamente.",
      code: "REPORT_RANGE_TOO_LARGE",
      limits: rowLimits,
      counts: rowCounts,
      exceeded: exceeded.map(([key]) => key),
    }, { status: 422 });
  }
  const [payments, expenses, billPayments, invoices, bills] = await Promise.all([
    prisma.payment.findMany({
      where: { organizationId, status: "CONFIRMED", receivedAt: paymentDate },
      select: { amount: true, currency: true, receivedAt: true }, take: 5000,
    }),
    prisma.expense.findMany({
      where: { organizationId, status: "PAID", billId: null, date: paymentDate },
      select: { amount: true, currency: true, date: true, category: { select: { name: true } } }, take: 5000,
    }),
    prisma.billPayment.findMany({
      where: { organizationId, paidAt: paymentDate },
      select: { amount: true, paidAt: true, bill: { select: { currency: true } } }, take: 5000,
    }),
    prisma.invoice.findMany({
      where: { organizationId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
        ...(to ? { issueDate: { lte: to } } : {}), ...(from ? { issueDate: { gte: from } } : {}) },
      select: { id: true, number: true, currency: true, total: true, amountPaid: true, dueDate: true, issueDate: true,
        client: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 2000,
    }),
    prisma.bill.findMany({
      where: { organizationId, status: { in: ["OPEN", "PARTIALLY_PAID"] },
        ...(to ? { issueDate: { lte: to } } : {}), ...(from ? { issueDate: { gte: from } } : {}) },
      select: { id: true, number: true, currency: true, total: true, amountPaid: true, dueDate: true,
        supplier: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 2000,
    }),
  ]);

  const cashIn = new Map<string, ReturnType<typeof D>>();
  const expenseOut = new Map<string, ReturnType<typeof D>>();
  const supplierOut = new Map<string, ReturnType<typeof D>>();
  const invoiced = new Map<string, ReturnType<typeof D>>();
  const receivable = new Map<string, ReturnType<typeof D>>();
  const overdueReceivable = new Map<string, ReturnType<typeof D>>();
  const payable = new Map<string, ReturnType<typeof D>>();
  const overduePayable = new Map<string, ReturnType<typeof D>>();
  const categoryTotals = new Map<string, ReturnType<typeof D>>();
  const monthly = new Map<string, { inflows: ReturnType<typeof D>; outflows: ReturnType<typeof D> }>();

  function monthBucket(date: Date, currency: string) {
    const month = date.toISOString().slice(0, 7);
    const key = month + "|" + currency.toUpperCase();
    if (!monthly.has(key)) monthly.set(key, { inflows: D(0), outflows: D(0) });
    return monthly.get(key)!;
  }

  for (const payment of payments) {
    add(cashIn, payment.currency, payment.amount);
    monthBucket(payment.receivedAt, payment.currency).inflows = monthBucket(payment.receivedAt, payment.currency).inflows.plus(payment.amount);
  }
  for (const expense of expenses) {
    add(expenseOut, expense.currency, expense.amount);
    const bucket = monthBucket(expense.date, expense.currency);
    bucket.outflows = bucket.outflows.plus(expense.amount);
    const category = expense.category?.name ?? "Sem categoria";
    add(categoryTotals, expense.currency + "|" + category, expense.amount);
  }
  for (const payment of billPayments) {
    const currency = payment.bill.currency;
    add(supplierOut, currency, payment.amount);
    monthBucket(payment.paidAt, currency).outflows = monthBucket(payment.paidAt, currency).outflows.plus(payment.amount);
  }

  const now = new Date();
  const overdueInvoices: Array<{ id: string; number: string | null; client: string; currency: string; balance: string; dueDate: string }> = [];
  for (const invoice of invoices) {
    add(invoiced, invoice.currency, invoice.total);
    const rawBalance = D(invoice.total).minus(invoice.amountPaid);
    const balance = rawBalance.gt(0) ? rawBalance : D(0);
    if (balance.gt(0)) {
      add(receivable, invoice.currency, balance);
      if (invoice.dueDate && invoice.dueDate < now) {
        add(overdueReceivable, invoice.currency, balance);
        overdueInvoices.push({ id: invoice.id, number: invoice.number, client: invoice.client.name,
          currency: invoice.currency, balance: balance.toFixed(2), dueDate: invoice.dueDate.toISOString() });
      }
    }
  }

  const overdueBills: Array<{ id: string; number: string | null; supplier: string; currency: string; balance: string; dueDate: string }> = [];
  for (const bill of bills) {
    const rawBalance = D(bill.total).minus(bill.amountPaid);
    const balance = rawBalance.gt(0) ? rawBalance : D(0);
    if (balance.gt(0)) {
      add(payable, bill.currency, balance);
      if (bill.dueDate && bill.dueDate < now) {
        add(overduePayable, bill.currency, balance);
        overdueBills.push({ id: bill.id, number: bill.number, supplier: bill.supplier.name,
          currency: bill.currency, balance: balance.toFixed(2), dueDate: bill.dueDate.toISOString() });
      }
    }
  }

  const currencies = new Set([...cashIn.keys(), ...expenseOut.keys(), ...supplierOut.keys(), ...invoiced.keys(),
    ...receivable.keys(), ...overdueReceivable.keys(), ...payable.keys(), ...overduePayable.keys()]);
  const summary = [...currencies].sort().map(currency => {
    const get = (map: Map<string, ReturnType<typeof D>>) => (map.get(currency) ?? D(0)).toFixed(2);
    return { currency, cashIn: get(cashIn), operatingExpenses: get(expenseOut), supplierPayments: get(supplierOut),
      netCashFlow: D(get(cashIn)).minus(get(expenseOut)).minus(get(supplierOut)).toFixed(2),
      invoiced: get(invoiced), receivables: get(receivable), overdueReceivables: get(overdueReceivable),
      payables: get(payable), overduePayables: get(overduePayable) };
  });

  const timeline: MonthRow[] = [...monthly.entries()].map(([key, value]) => {
    const [month, currency] = key.split("|");
    return { month, currency, inflows: value.inflows.toFixed(2), outflows: value.outflows.toFixed(2) };
  }).sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency));

  const expensesByCategory = [...categoryTotals.entries()].map(([key, amount]) => {
    const separator = key.indexOf("|");
    return { currency: key.slice(0, separator), category: key.slice(separator + 1), amount: amount.toFixed(2) };
  }).sort((a, b) => a.currency.localeCompare(b.currency) || Number(b.amount) - Number(a.amount));

  return NextResponse.json({
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    summary, timeline, expensesByCategory,
    overdueInvoices: overdueInvoices.slice(0, 100), overdueBills: overdueBills.slice(0, 100),
    limits: { payments: 5000, expenses: 5000, supplierPayments: 5000, invoices: 2000, bills: 2000 },
  });
}
