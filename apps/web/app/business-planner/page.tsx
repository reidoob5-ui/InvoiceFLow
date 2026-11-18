import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { D } from "@/lib/money";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import BusinessPlannerClient from "./planner-client";

const DAY = 24 * 60 * 60 * 1000;

export default async function BusinessPlannerPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "reports:read")) redirect("/dashboard");

  const organizationId = current.membership.organizationId;
  const since = new Date(Date.now() - 30 * DAY);
  const [payments, expenses, supplierPaymentCount, supplierPayments] = await Promise.all([
    prisma.payment.groupBy({
      by: ["currency"],
      where: { organizationId, status: "CONFIRMED", receivedAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["currency"],
      where: { organizationId, status: "PAID", billId: null, date: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.billPayment.count({ where: { organizationId, paidAt: { gte: since } } }),
    prisma.billPayment.findMany({
      where: { organizationId, paidAt: { gte: since } },
      select: { amount: true, bill: { select: { currency: true } } },
      take: 5000,
    }),
  ]);

  const supplierPaymentsComplete = supplierPaymentCount <= 5000;
  const rows = new Map<string, { received: ReturnType<typeof D>; expenses: ReturnType<typeof D>; suppliers: ReturnType<typeof D> }>();
  const bucket = (currency: string) => {
    const key = currency.toUpperCase();
    if (!rows.has(key)) rows.set(key, { received: D(0), expenses: D(0), suppliers: D(0) });
    return rows.get(key)!;
  };
  for (const item of payments) bucket(item.currency).received = D(item._sum.amount);
  for (const item of expenses) bucket(item.currency).expenses = D(item._sum.amount);
  if (supplierPaymentsComplete) {
    for (const item of supplierPayments) {
      const currency = item.bill.currency.toUpperCase();
      bucket(currency).suppliers = bucket(currency).suppliers.plus(item.amount);
    }
  }

  const cashMovements = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, values]) => ({
    currency,
    received: values.received.toString(),
    expenses: values.expenses.toString(),
    suppliers: values.suppliers.toString(),
    net: supplierPaymentsComplete ? values.received.minus(values.expenses).minus(values.suppliers).toString() : null,
  }));

  return <BusinessPlannerClient cashMovements={cashMovements} />;
}
