import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";

export const runtime = "nodejs";

const kinds = ["VAT", "SALES_TAX", "WITHHOLDING", "OTHER"] as const;
type TaxKind = (typeof kinds)[number];

function parseRate(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (String(value).trim() === "") return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
}

function permission(role: string, action: "read" | "write" | "delete") {
  assertCan(role as Parameters<typeof assertCan>[0], `taxes:${action}`);
}

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { permission(current.membership.role, "read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const taxes = await prisma.taxRate.findMany({
    where: { organizationId: current.membership.organizationId },
    orderBy: [{ active: "desc" }, { isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, rate: true, kind: true, country: true, region: true, exempt: true, isDefault: true, active: true, createdAt: true },
  });
  return NextResponse.json({ taxes });
}

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { permission(current.membership.role, "write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const rate = parseRate(body?.rate);
  const kind = kinds.includes(body?.kind) ? body.kind as TaxKind : "VAT";
  const exempt = body?.exempt === true;
  const isDefault = body?.isDefault === true && !exempt;
  const country = typeof body?.country === "string" ? body.country.trim().slice(0, 2).toUpperCase() || null : null;
  const region = typeof body?.region === "string" ? body.region.trim().slice(0, 80) || null : null;
  if (name.length < 2) return NextResponse.json({ error: "O nome deve ter pelo menos 2 caracteres." }, { status: 400 });
  if (rate === null) return NextResponse.json({ error: "A taxa deve ser um número entre 0 e 100." }, { status: 400 });
  if (country && !/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "O país deve usar o código ISO de 2 letras." }, { status: 400 });

  const organizationId = current.membership.organizationId;
  const tax = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.taxRate.updateMany({ where: { organizationId }, data: { isDefault: false } });
    return tx.taxRate.create({
      data: { organizationId, name, rate, kind, exempt, isDefault, country, region, active: true },
      select: { id: true, name: true, rate: true, kind: true, country: true, region: true, exempt: true, isDefault: true, active: true, createdAt: true },
    });
  }, { isolationLevel: "Serializable" });
  await audit({ action: "tax_rate.created", userId: current.user.id, organizationId, entityType: "TaxRate", entityId: tax.id });
  return NextResponse.json({ tax }, { status: 201 });
}
