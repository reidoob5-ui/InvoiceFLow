import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { markOverdueInvoices, runRecurringInvoices, sendOverdueReminders } from "@/lib/cron";
import { withOrganizationPlanLimit } from "@/lib/plan-access";
import { GET } from "@/app/api/cron/daily/route";

/** Opt in with INTEGRATION_DB=1 (needs a migrated PostgreSQL in DATABASE_URL). */
const run = process.env.INTEGRATION_DB === "1";
const DAY = 86_400_000;

describe.skipIf(!run)("daily job (real PostgreSQL)", () => {
  const suffix = randomBytes(4).toString("hex");
  let orgId: string; let clientId: string;

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: "Cron Org", slug: `cron-${suffix}` } })).id;
    clientId = (await prisma.client.create({ data: { organizationId: orgId, name: "C", email: "c@c.ao" } })).id;
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  const recurring = (nextRunAt: Date, extra: Record<string, unknown> = {}) => prisma.recurringInvoice.create({
    data: {
      organizationId: orgId, clientId, frequency: "MONTHLY", intervalCount: 1, nextRunAt, currency: "AOA", paymentTermsDays: 15,
      lines: [{ description: "Avença mensal", quantity: "1", unitPrice: "5000", discountPercent: "0", taxRateId: null }], ...extra,
    },
  });

  it("creates the due invoice as a DRAFT, advances the schedule, and is idempotent", async () => {
    const r = await recurring(new Date(Date.now() - DAY));
    const first = await runRecurringInvoices();
    expect(first.errors).toEqual([]);
    expect(first.created).toBeGreaterThanOrEqual(1);
    const invoices = await prisma.invoice.findMany({ where: { recurringId: r.id } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).toBe("DRAFT");
    expect(String(invoices[0].total)).toBe("5000");
    const after = await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 20 * DAY);
    expect(after.lastRunAt).not.toBeNull();
    await runRecurringInvoices();
    expect(await prisma.invoice.count({ where: { recurringId: r.id } })).toBe(1); // second run creates nothing
  });

  it("two overlapping workers never duplicate an invoice", async () => {
    const r = await recurring(new Date(Date.now() - DAY));
    await Promise.all([runRecurringInvoices(), runRecurringInvoices(), runRecurringInvoices()]);
    expect(await prisma.invoice.count({ where: { recurringId: r.id } })).toBe(1);
  });

  it("autoSend issues the invoice with a number and a snapshot", async () => {
    const r = await recurring(new Date(Date.now() - DAY), { autoSend: true });
    await runRecurringInvoices();
    const inv = await prisma.invoice.findFirstOrThrow({ where: { recurringId: r.id } });
    expect(inv.status).toBe("ISSUED");
    expect(inv.number).toMatch(/^INV-/);
    expect(inv.snapshot).not.toBeNull();
  });

  it("deactivates a schedule that is past its end date and creates nothing", async () => {
    const r = await recurring(new Date(Date.now() - 40 * DAY), { endsAt: new Date(Date.now() - 35 * DAY) });
    await runRecurringInvoices();
    expect(await prisma.invoice.count({ where: { recurringId: r.id } })).toBeLessThanOrEqual(1);
    expect((await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: r.id } })).active).toBe(false);
  });

  it("marks only genuinely overdue, unpaid invoices as OVERDUE", async () => {
    const mk = (status: "ISSUED" | "PAID" | "PARTIALLY_PAID", dueDate: Date | null) => prisma.invoice.create({
      data: { organizationId: orgId, clientId, status, dueDate, total: "100", subtotal: "100", number: `T-${randomBytes(3).toString("hex")}`, issueDate: new Date() },
    });
    const late = await mk("ISSUED", new Date(Date.now() - 3 * DAY));
    const latePartial = await mk("PARTIALLY_PAID", new Date(Date.now() - 3 * DAY));
    const future = await mk("ISSUED", new Date(Date.now() + 3 * DAY));
    const paidLate = await mk("PAID", new Date(Date.now() - 3 * DAY));
    await markOverdueInvoices();
    const status = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(late.id)).toBe("OVERDUE");
    expect(await status(latePartial.id)).toBe("OVERDUE");
    expect(await status(future.id)).toBe("ISSUED");
    expect(await status(paidLate.id)).toBe("PAID");
  });

  it("plan-limited writes work with the pg adapter AND stay serialized per organization (lock regression)", async () => {
    const fresh = await prisma.organization.create({ data: { name: "Lock Org", slug: `lock-${suffix}` } });
    const events: string[] = [];
    const critical = (name: string) => withOrganizationPlanLimit(fresh.id, "maxInvoicesPerMonth", 1, async () => {
      events.push(`start:${name}`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      events.push(`end:${name}`);
      return name;
    });
    const results = await Promise.all([critical("a"), critical("b"), critical("c")]);
    expect(results.every((r) => r.allowed)).toBe(true);
    // Strictly start,end,start,end,...: no two critical sections ever overlapped.
    expect(events.filter((_, i) => i % 2 === 0).every((e) => e.startsWith("start:"))).toBe(true);
    expect(events.filter((_, i) => i % 2 === 1).every((e) => e.startsWith("end:"))).toBe(true);
    for (let i = 0; i < events.length; i += 2) expect(events[i].slice(6)).toBe(events[i + 1].slice(4));
    await prisma.organization.delete({ where: { id: fresh.id } });
  });

  it("reminders are off unless AUTO_REMINDERS=true", async () => {
    expect(await sendOverdueReminders(new Date(), {} as NodeJS.ProcessEnv)).toEqual({ enabled: false, sent: 0 });
  });

  it("the HTTP endpoint fails closed and rejects wrong secrets", async () => {
    const call = (auth?: string) => GET(new Request("http://x/api/cron/daily", { headers: auth ? { authorization: auth } : {} }));
    const saved = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await call("Bearer anything-long-enough-123")).status).toBe(503); // not configured → closed
      process.env.CRON_SECRET = "a-very-long-secret-value-1234";
      expect((await call()).status).toBe(401);
      expect((await call("Bearer wrong-wrong-wrong-wrong")).status).toBe(401);
      expect((await call("a-very-long-secret-value-1234")).status).toBe(401); // missing "Bearer "
      expect((await call("Bearer a-very-long-secret-value-1234")).status).toBe(200);
      process.env.CRON_SECRET = "short";
      expect((await call("Bearer short")).status).toBe(503); // weak secrets are refused outright
    } finally { if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved; }
  });
});
