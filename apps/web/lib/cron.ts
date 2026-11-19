import { prisma } from "@/lib/db";
import { calculatePreparedLines, InvoiceInputError, prepareInvoiceLines } from "@/lib/invoices";
import { issueDraftInvoice } from "@/lib/document-workflow";
import { sendInvoiceEmail } from "@/lib/invoice-email";
import { dueRuns, nextOccurrence } from "@/lib/recurrence";
import { withOrganizationPlanLimit } from "@/lib/plan-access";

/** Scheduled housekeeping. Every step is idempotent, so a retried or overlapping run is safe. */

const startOfDayUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const DAY = 24 * 60 * 60 * 1000;

/** Invoices past their due date become OVERDUE (payments already do this lazily; this keeps lists and filters honest). */
export async function markOverdueInvoices(now = new Date()) {
  const result = await prisma.invoice.updateMany({
    where: { type: "INVOICE", status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: startOfDayUtc(now) } },
    data: { status: "OVERDUE" },
  });
  return { updated: result.count };
}

export async function runRecurringInvoices(now = new Date()) {
  const summary = { created: 0, issued: 0, emailed: 0, skipped: 0, errors: [] as string[] };
  const due = await prisma.recurringInvoice.findMany({
    where: { active: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, take: 50,
  });

  for (const recurring of due) {
    const { runs, next } = dueRuns(recurring.nextRunAt, now, recurring.frequency, recurring.intervalCount, recurring.endsAt);
    if (!runs.length) {
      // Past its end date: switch it off so it stops being picked up.
      await prisma.recurringInvoice.updateMany({ where: { id: recurring.id, nextRunAt: recurring.nextRunAt }, data: { active: false } });
      continue;
    }
    const anchor = recurring.nextRunAt.getUTCDate();

    for (let i = 0; i < runs.length; i++) {
      const runDate = runs[i];
      const afterRun = runs[i + 1] ?? next ?? nextOccurrence(runDate, recurring.frequency, recurring.intervalCount, anchor);
      try {
        const lines = await prepareInvoiceLines(recurring.lines, recurring.organizationId, recurring.currency);
        const calculated = calculatePreparedLines(lines, 0);
        const execution = await withOrganizationPlanLimit(recurring.organizationId, "maxInvoicesPerMonth", 1, async (tx) => {
          // Claim this exact run atomically with the invoice creation: a concurrent worker loses the race.
          const claimed = await tx.recurringInvoice.updateMany({
            where: { id: recurring.id, active: true, nextRunAt: runDate },
            data: {
              nextRunAt: afterRun, lastRunAt: now,
              ...(recurring.endsAt && afterRun.getTime() > recurring.endsAt.getTime() ? { active: false } : {}),
            },
          });
          if (claimed.count !== 1) return null;
          const invoice = await tx.invoice.create({
            data: {
              organizationId: recurring.organizationId, clientId: recurring.clientId, status: "DRAFT", currency: recurring.currency,
              paymentTermsDays: recurring.paymentTermsDays, notes: recurring.notes, recurringId: recurring.id,
              ...calculated, lines: { create: calculated.lines },
              events: { create: { userId: null, action: "created_from_recurring", data: { recurringId: recurring.id, runDate: runDate.toISOString() } } },
            },
            select: { id: true },
          });
          if (recurring.autoSend) await issueDraftInvoice(tx, { invoiceId: invoice.id, organizationId: recurring.organizationId, userId: null, now });
          return invoice;
        });

        if (!execution.allowed) {
          summary.skipped++;
          summary.errors.push(`recurring ${recurring.id}: ${execution.result.code}`);
          break; // keep nextRunAt where it is; the run is retried on the next job once the limit/subscription allows it
        }
        if (!execution.value) { summary.skipped++; continue; }
        summary.created++;
        if (recurring.autoSend) {
          summary.issued++;
          const sent = await sendInvoiceEmail({ invoiceId: execution.value.id, organizationId: recurring.organizationId, userId: null, kind: "invoice_send" });
          if (sent.sent) summary.emailed++;
          else summary.errors.push(`recurring ${recurring.id}: email ${sent.reason}`);
        }
      } catch (error) {
        summary.errors.push(`recurring ${recurring.id}: ${error instanceof InvoiceInputError ? error.message : "unexpected error"}`);
        if (!(error instanceof InvoiceInputError)) console.error("[cron:recurring]", error);
        break;
      }
    }
  }
  return summary;
}

const REMINDER_FIRST_AFTER_DAYS = 1;
const REMINDER_EVERY_DAYS = 7;
const REMINDER_MAX = 3;

/** Opt-in (AUTO_REMINDERS=true): emailing customers on a company's behalf must be a deliberate choice. */
export async function sendOverdueReminders(now = new Date(), env: NodeJS.ProcessEnv = process.env) {
  if (env.AUTO_REMINDERS !== "true") return { enabled: false, sent: 0 };
  const today = startOfDayUtc(now);
  const candidates = await prisma.invoice.findMany({
    where: {
      type: "INVOICE", status: "OVERDUE", dueDate: { lt: new Date(today.getTime() - (REMINDER_FIRST_AFTER_DAYS - 1) * DAY) },
      client: { email: { not: null } },
    },
    orderBy: { dueDate: "asc" }, take: 100,
    select: { id: true, organizationId: true, events: { where: { action: "reminder_sent" }, select: { createdAt: true }, orderBy: { createdAt: "desc" } } },
  });
  let sent = 0;
  for (const invoice of candidates) {
    if (invoice.events.length >= REMINDER_MAX) continue;
    const last = invoice.events[0]?.createdAt;
    if (last && now.getTime() - last.getTime() < REMINDER_EVERY_DAYS * DAY) continue;
    const result = await sendInvoiceEmail({ invoiceId: invoice.id, organizationId: invoice.organizationId, userId: null, kind: "payment_reminder" });
    if (result.sent) sent++;
  }
  return { enabled: true, sent };
}

export async function cleanupExpired(now = new Date()) {
  const [sessions, tokens, webhookEvents] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now.getTime() - 30 * DAY) } }, { usedAt: { lt: new Date(now.getTime() - 30 * DAY) } }] } }),
    // Providers retry for days, never months: 90 days of idempotency history is ample.
    prisma.providerWebhookEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * DAY) } } }),
  ]);
  return { sessions: sessions.count, authTokens: tokens.count, webhookEvents: webhookEvents.count };
}
