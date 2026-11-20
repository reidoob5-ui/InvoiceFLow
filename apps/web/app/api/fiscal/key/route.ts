import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { FiscalError, setTaxpayerKey } from "@/lib/agt/service";

export const runtime = "nodejs";

/** Define a chave RSA do contribuinte (PEM do portal AGT). Sem PEM, gera um par APENAS em homologação. Nunca devolve a chave privada. */
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
  const privateKeyPem = typeof body?.privateKeyPem === "string" ? body.privateKeyPem.slice(0, 10_000) : undefined;
  const profile = await prisma.fiscalProfile.findUnique({ where: { organizationId }, select: { environment: true } });
  if (!profile) return NextResponse.json({ error: "Configure primeiro o perfil fiscal." }, { status: 409 });
  if (!privateKeyPem && profile.environment === "PRODUCTION") {
    return NextResponse.json({ error: "Em produção tem de fornecer a chave emitida pela AGT." }, { status: 400 });
  }
  try {
    const key = await setTaxpayerKey(organizationId, { privateKeyPem });
    await audit({ organizationId, userId: current.user.id, action: "fiscal.key.set", entityType: "FiscalProfile", metadata: { fingerprint: key.fingerprint } });
    return NextResponse.json({ ok: true, fingerprint: key.fingerprint, publicKeyPem: key.publicKeyPem });
  } catch (error) {
    if (error instanceof FiscalError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Chave RSA inválida (PEM, mínimo 2048 bits)." }, { status: 400 });
  }
}
