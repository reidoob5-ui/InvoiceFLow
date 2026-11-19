import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { calculatePreparedLines, InvoiceInputError, prepareInvoiceLines } from "@/lib/invoices";

export const runtime = "nodejs";

const FREQUENCIES = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
type Freq = (typeof FREQUENCIES)[number];

function authError(error: unknown) {
  if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 });
  throw error;
}

const parseDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:read"); } catch (error) { return authError(error); }
  const items = await prisma.recurringInvoice.findMany({
    where: { organizationId: current.membership.organizationId }, orderBy: { nextRunAt: "asc" }, take: 200,
    select: { id: true, clientId: true, frequency: true, intervalCount: true, nextRunAt: true, endsAt: true, active: true, autoSend: true, currency: true, lastRunAt: true, client: { select: { name: true } } },
  });
  return NextResponse.json({ recurring: items });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:write"); } catch (error) { return authError(error); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  const organizationId = current.membership.organizationId;
  const client = await prisma.client.findFirst({ where: { id: typeof body.clientId === "string" ? body.clientId : "", organizationId, archivedAt: null }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Selecciona um cliente activo desta empresa." }, { status: 400 });
  if (!FREQUENCIES.includes(body.frequency)) return NextResponse.json({ error: "Frequência inválida." }, { status: 400 });
  const frequency = body.frequency as Freq;
  const intervalCount = Number(body.intervalCount ?? 1);
  if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 24) return NextResponse.json({ error: "Intervalo inválido." }, { status: 400 });
  const startsAt = parseDate(body.startDate);
  const endsAt = body.endsAt ? parseDate(body.endsAt) : null;
  if (!startsAt || (body.endsAt && !endsAt) || (endsAt && endsAt < startsAt)) return NextResponse.json({ error: "Datas inválidas." }, { status: 400 });
  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : current.membership.organization.currency;
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Moeda inválida." }, { status: 400 });
  const termsDays = Number(body.paymentTermsDays ?? 30);
  if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365) return NextResponse.json({ error: "Prazo de pagamento inválido." }, { status: 400 });

  try {
    // Validate now (products, taxes, amounts), so a recurring template can never fail later for bad input.
    const prepared = await prepareInvoiceLines(body.lines, organizationId, currency);
    calculatePreparedLines(prepared, 0);
    const recurring = await prisma.recurringInvoice.create({
      data: {
        organizationId, clientId: client.id, frequency, intervalCount, nextRunAt: startsAt, endsAt, currency,
        paymentTermsDays: termsDays, autoSend: body.autoSend === true,
        notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) || null : null,
        lines: prepared.map(({ productId, description, quantity, unitPrice, discountPercent, taxRateId }) => ({ productId, description, quantity, unitPrice, discountPercent, taxRateId })),
      },
      select: { id: true, frequency: true, intervalCount: true, nextRunAt: true, endsAt: true, active: true, autoSend: true },
    });
    await audit({ action: "recurring.created", userId: current.user.id, organizationId, entityType: "RecurringInvoice", entityId: recurring.id });
    return NextResponse.json({ recurring }, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
