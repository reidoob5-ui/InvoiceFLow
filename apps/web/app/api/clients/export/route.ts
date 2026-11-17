import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";
export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "clients:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const rows = await prisma.client.findMany({ where: { organizationId: current.membership.organizationId, archivedAt: null }, orderBy: { name: "asc" }, select: { name:true,type:true,email:true,company:true,phone:true,taxId:true,country:true,city:true,currency:true } });
  const csv = toCsv(["name","type","email","company","phone","taxId","country","city","currency"], rows.map(x => [x.name,x.type,x.email,x.company,x.phone,x.taxId,x.country,x.city,x.currency]));
  return new NextResponse(csv, { headers: { "content-type":"text/csv; charset=utf-8", "content-disposition":'attachment; filename="invoiceflow-clients.csv"', "cache-control":"no-store" } });
}
