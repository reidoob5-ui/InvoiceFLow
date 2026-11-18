import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { calculatePreparedLines, InvoiceInputError, prepareInvoiceLines } from "@/lib/invoices";
import { withOrganizationPlanLimit, planLimitResponse } from "@/lib/plan-access";

export const runtime = "nodejs";

function authError(error: unknown) {
  if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 });
  throw error;
}

export async function GET(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:read"); } catch (error) { return authError(error); }
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const status = request.nextUrl.searchParams.get("status");
  const allowed = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"];
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: current.membership.organizationId,
      ...(status && allowed.includes(status) ? { status: status as "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID" } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { client: { is: { name: { contains: q, mode: "insensitive" } } } }] } : {}) },
    orderBy: [{ createdAt: "desc" }], take: 200,
    select: { id: true, number: true, status: true, currency: true, subtotal: true, taxTotal: true, total: true, amountPaid: true, issueDate: true, dueDate: true, createdAt: true, client: { select: { name: true } } },
  });
  return NextResponse.json({ invoices });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:write"); } catch (error) { return authError(error); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const organizationId = current.membership.organizationId;
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId, archivedAt: null } });
  if (!client) return NextResponse.json({ error: "Selecciona um cliente activo desta empresa." }, { status: 400 });
  const organizationDefaults = await prisma.organization.findUnique({ where: { id: organizationId }, select: { invoiceTerms: true } });
  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : client.currency || current.membership.organization.currency;
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Moeda inválida." }, { status: 400 });
  const termsDays = Number(body.paymentTermsDays ?? 30);
  if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365) return NextResponse.json({ error: "Prazo de pagamento inválido." }, { status: 400 });
  const withholdingRate = Number(body.withholdingRate ?? 0);
  if (!Number.isFinite(withholdingRate) || withholdingRate < 0 || withholdingRate > 100) return NextResponse.json({ error: "Retenção inválida." }, { status: 400 });
  try {
    const lines = await prepareInvoiceLines(body.lines, organizationId, currency);
    const calculated = calculatePreparedLines(lines, withholdingRate);
    const execution = await withOrganizationPlanLimit(organizationId, "maxInvoicesPerMonth", 1, (tx) => tx.invoice.create({
      data: {
        organizationId, clientId, createdById: current.user.id, status: "DRAFT", currency,
        paymentTermsDays: termsDays, withholdingRate,
        notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) || null : null,
        terms: typeof body.terms === "string" ? body.terms.trim().slice(0, 4000) || null : organizationDefaults?.invoiceTerms ?? null,
        ...calculated,
        lines: { create: calculated.lines },
        events: { create: { userId: current.user.id, action: "created" } },
      },
      select: { id: true, number: true, status: true, currency: true, subtotal: true, discountTotal: true, taxTotal: true, withholdingTotal: true, total: true, createdAt: true },
    }));
    if (!execution.allowed) return NextResponse.json(planLimitResponse(execution.result), { status: 402 });
    const invoice = execution.value;
    await audit({ action: "invoice.created", userId: current.user.id, organizationId, entityType: "Invoice", entityId: invoice.id });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
