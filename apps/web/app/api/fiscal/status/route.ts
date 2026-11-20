import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { deliverySummary, dueSoon, overdue } from "@/lib/agt/service";

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
  const [summary, late, soon, recent] = await Promise.all([
    deliverySummary(organizationId),
    overdue(organizationId),
    dueSoon(organizationId),
    prisma.fiscalDelivery.findMany({
      where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 30,
      select: { state: true, attempts: true, deadlineAt: true, errors: true, updatedAt: true, document: { select: { documentNo: true, documentType: true, documentDate: true } } },
    }),
  ]);
  return NextResponse.json({ summary, overdue: late, dueSoon: soon, recent });
}
