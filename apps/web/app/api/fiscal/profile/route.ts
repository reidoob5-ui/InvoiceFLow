import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { FiscalError, saveFiscalProfile, setFiscalEnabled } from "@/lib/agt/service";

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
  const profile = await prisma.fiscalProfile.findUnique({
    where: { organizationId },
    select: { nif: true, companyName: true, eacCode: true, environment: true, enabled: true, keyFingerprint: true, publicKeyPem: true, privateKeyEncrypted: true },
  });
  if (!profile) return NextResponse.json({ profile: null });
  const { privateKeyEncrypted, ...safe } = profile;
  return NextResponse.json({ profile: { ...safe, hasKey: !!privateKeyEncrypted } });
}

export async function PUT(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "fiscal:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const organizationId = current.membership.organizationId;
  const body = await request.json().catch(() => null);
  try {
    await saveFiscalProfile(organizationId, {
      nif: typeof body?.nif === "string" ? body.nif : "",
      companyName: typeof body?.companyName === "string" ? body.companyName : "",
      eacCode: typeof body?.eacCode === "string" ? body.eacCode : null,
      environment: body?.environment === "PRODUCTION" ? "PRODUCTION" : "HOMOLOGATION",
    });
    if (typeof body?.enabled === "boolean") await setFiscalEnabled(organizationId, body.enabled);
  } catch (error) {
    if (error instanceof FiscalError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    throw error;
  }
  await audit({ organizationId, userId: current.user.id, action: "fiscal.profile.update", entityType: "FiscalProfile" });
  return NextResponse.json({ ok: true });
}
