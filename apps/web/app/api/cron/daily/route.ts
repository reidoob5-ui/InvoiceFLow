import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expireManualSubscriptions } from "@/lib/billing/manual";
import { runFiscalSync } from "@/lib/agt/service";
import { cleanupExpired, markOverdueInvoices, runRecurringInvoices, sendOverdueReminders } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Constant-time comparison of two secrets (hashed first so lengths never leak). */
function secretsMatch(provided: string, expected: string) {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: without a configured secret nobody can trigger the job.
  if (!secret || secret.length < 16) return NextResponse.json({ error: "Cron não configurado." }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretsMatch(token, secret)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const now = new Date();
  // Order matters: create recurring invoices first, then settle statuses, then remind.
  const recurring = await runRecurringInvoices(now);
  const overdue = await markOverdueInvoices(now);
  const reminders = await sendOverdueReminders(now);
  const cleanup = await cleanupExpired(now);
  const fiscal = await runFiscalSync(now).catch((e) => ({ error: String(e?.message ?? e).slice(0, 200) }));
  const subscriptions = await expireManualSubscriptions(now).catch((e) => ({ error: String(e?.message ?? e).slice(0, 200) }));
  return NextResponse.json({ ok: true, ranAt: now.toISOString(), recurring, overdue, reminders, cleanup, fiscal, subscriptions });
}

// Vercel Cron issues GET; POST is allowed for manual triggers and other schedulers.
export const GET = handle;
export const POST = handle;
