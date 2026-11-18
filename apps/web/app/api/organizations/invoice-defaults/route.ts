import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:write"); }
  catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão para criar facturas." }, { status: 403 });
    throw error;
  }
  const organization = await prisma.organization.findFirst({
    where: { id: current.membership.organizationId, status: "ACTIVE" },
    select: { currency: true, defaultPaymentTerms: true, invoiceNotes: true, invoiceTerms: true },
  });
  if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  return NextResponse.json({ defaults: organization });
}
