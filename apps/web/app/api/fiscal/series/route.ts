import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { FiscalError, agtClientFor, requestSeries } from "@/lib/agt/service";
import { DOCUMENT_TYPES } from "@/lib/agt/codes";
import { allowedSeriesYears, luandaParts } from "@/lib/agt/series";

export const runtime = "nodejs";

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "fiscal:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const organizationId = current.membership.organizationId;
  const series = await prisma.fiscalSeries.findMany({
    where: { organizationId }, orderBy: [{ year: "desc" }, { documentType: "asc" }], take: 200,
    select: { id: true, code: true, year: true, documentType: true, nextNumber: true, lastNumber: true, lastDate: true, status: true, establishment: true, contingency: true },
  });
  return NextResponse.json({ series, allowedYears: allowedSeriesYears(luandaParts().date) });
}

/** Pede uma série nova à AGT (solicitarSerie) e regista-a. */
export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "fiscal:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const organizationId = current.membership.organizationId;
  const body = await request.json().catch(() => null);
  const year = Number(body?.year);
  const documentType = typeof body?.documentType === "string" ? body.documentType : "";
  if (!allowedSeriesYears(luandaParts().date).includes(year)) return NextResponse.json({ error: "Ano não permitido (até 15 de Dezembro só o ano corrente)." }, { status: 400 });
  if (!(documentType in DOCUMENT_TYPES)) return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
  try {
    const client = await agtClientFor(organizationId);
    const result = await requestSeries(organizationId, client, {
      year, documentType, establishment: typeof body?.establishment === "string" ? body.establishment.slice(0, 20) : "SEDE", contingency: body?.contingency === true,
    });
    if (result.kind !== "created") return NextResponse.json({ error: "A AGT não criou a série.", result }, { status: 502 });
    await audit({ organizationId, userId: current.user.id, action: "fiscal.series.request", entityType: "FiscalSeries", entityId: result.series.id, metadata: { code: result.seriesCode, year, documentType } });
    return NextResponse.json({ ok: true, code: result.seriesCode });
  } catch (error) {
    if (error instanceof FiscalError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    return NextResponse.json({ error: "Falha ao contactar a AGT." }, { status: 502 });
  }
}
