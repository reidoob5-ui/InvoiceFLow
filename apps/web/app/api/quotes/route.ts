import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { calculatePreparedLines, InvoiceInputError, prepareInvoiceLines } from "@/lib/invoices";
import { D } from "@/lib/money";

export const runtime = "nodejs";

function permissionError(error: unknown) {
  if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para esta operação." }, { status: 403 });
  throw error;
}

export async function GET(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "quotes:read"); } catch (error) { return permissionError(error); }
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const status = request.nextUrl.searchParams.get("status");
  const allowed = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"] as const;
  const quotes = await prisma.quote.findMany({
    where: { organizationId: current.membership.organizationId,
      ...(status && allowed.includes(status as typeof allowed[number]) ? { status: status as typeof allowed[number] } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { client: { is: { name: { contains: q, mode: "insensitive" } } } }] } : {}) },
    orderBy: [{ createdAt: "desc" }], take: 200,
    select: { id: true, number: true, title: true, status: true, currency: true, total: true, issueDate: true, validUntil: true, createdAt: true, client: { select: { name: true } } },
  });
  return NextResponse.json({ quotes });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "quotes:write"); } catch (error) { return permissionError(error); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const organizationId = current.membership.organizationId;
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId, archivedAt: null }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Selecciona um cliente activo desta empresa." }, { status: 400 });
  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : current.membership.organization.currency;
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Moeda inválida." }, { status: 400 });
  const validUntil = body.validUntil ? new Date(body.validUntil) : null;
  if (validUntil && Number.isNaN(validUntil.getTime())) return NextResponse.json({ error: "Data de validade inválida." }, { status: 400 });
  try {
    const prepared = await prepareInvoiceLines(body.lines, organizationId, currency);
    const calculated = calculatePreparedLines(prepared, 0);
    if (D(calculated.total).lte(0)) return NextResponse.json({ error: "O orçamento precisa de um total superior a zero." }, { status: 400 });
    const quote = await prisma.quote.create({
      data: {
        organizationId, clientId, status: "DRAFT", currency,
        title: typeof body.title === "string" ? body.title.trim().slice(0, 160) || null : null,
        notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) || null : null,
        terms: typeof body.terms === "string" ? body.terms.trim().slice(0, 4000) || null : null,
        validUntil,
        subtotal: calculated.subtotal, discountTotal: calculated.discountTotal, taxTotal: calculated.taxTotal, total: calculated.total,
        lines: { create: calculated.lines.map((line) => ({
          productId: line.productId, position: line.position, description: line.description,
          quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent,
          taxRate: line.taxRate, lineTotal: line.lineTotal,
        })) },
        events: { create: { userId: current.user.id, action: "created" } },
      },
      select: { id: true, status: true, currency: true, subtotal: true, discountTotal: true, taxTotal: true, total: true, validUntil: true, createdAt: true },
    });
    await audit({ action: "quote.created", userId: current.user.id, organizationId, entityType: "Quote", entityId: quote.id });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
