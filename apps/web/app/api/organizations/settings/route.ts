import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit, getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { isLocale } from "@/lib/i18n";

export const runtime = "nodejs";

const fields = {
  id: true, name: true, legalName: true, taxId: true, email: true, phone: true,
  website: true, addressLine1: true, addressLine2: true, city: true, postalCode: true,
  country: true, currency: true, timezone: true, locale: true, defaultPaymentTerms: true,
  invoicePrefix: true, quotePrefix: true, invoiceNotes: true, invoiceTerms: true,
} as const;

function permission(role: string, action: "read" | "write") {
  assertCan(role as Parameters<typeof assertCan>[0], `settings:${action}`);
}

function text(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  return value.trim().slice(0, max) || null;
}

export async function GET() {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { permission(current.membership.role, "read"); }
  catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Não tens permissão para consultar as definições da empresa." }, { status: 403 });
    throw error;
  }
  const organization = await prisma.organization.findFirst({
    where: { id: current.membership.organizationId, status: "ACTIVE" },
    select: fields,
  });
  if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  return NextResponse.json({ organization });
}

export async function PATCH(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { permission(current.membership.role, "write"); }
  catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Apenas proprietários e administradores podem alterar estas definições." }, { status: 403 });
    throw error;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const stringKeys = ["name", "legalName", "taxId", "email", "phone", "website", "addressLine1", "addressLine2", "city", "postalCode", "country", "currency", "timezone", "locale", "invoicePrefix", "quotePrefix", "invoiceNotes", "invoiceTerms"];
  if (stringKeys.some((key) => body[key] !== undefined && body[key] !== null && typeof body[key] !== "string")) {
    return NextResponse.json({ error: "Um ou mais campos de texto têm um formato inválido." }, { status: 400 });
  }

  const name = text(body.name, 120);
  const legalName = text(body.legalName, 160);
  const taxId = text(body.taxId, 40);
  const email = text(body.email, 254);
  const phone = text(body.phone, 40);
  const website = text(body.website, 200);
  const addressLine1 = text(body.addressLine1, 160);
  const addressLine2 = text(body.addressLine2, 160);
  const city = text(body.city, 100);
  const postalCode = text(body.postalCode, 24);
  const country = text(body.country, 2);
  const currency = text(body.currency, 3);
  const timezone = text(body.timezone, 80);
  const locale = text(body.locale, 8);
  const invoicePrefix = text(body.invoicePrefix, 12);
  const quotePrefix = text(body.quotePrefix, 12);
  const invoiceNotes = text(body.invoiceNotes, 4000);
  const invoiceTerms = text(body.invoiceTerms, 4000);
  const terms = body.defaultPaymentTerms;

  if (name === null || (name !== undefined && name.length < 2)) return NextResponse.json({ error: "O nome da empresa deve ter pelo menos 2 caracteres." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Introduz um endereço de e-mail válido." }, { status: 400 });
  if (website) {
    try { const url = new URL(website); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
    catch { return NextResponse.json({ error: "O website deve começar por https:// ou http://." }, { status: 400 }); }
  }
  if (country && !/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "O país deve usar um código ISO de duas letras." }, { status: 400 });
  if (currency && !/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "A moeda deve usar um código ISO de três letras, por exemplo AOA, USD ou EUR." }, { status: 400 });
  if (locale && !isLocale(locale)) return NextResponse.json({ error: "Idioma não suportado. Escolhe Português, English, Français ou Español." }, { status: 400 });
  if (timezone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
    catch { return NextResponse.json({ error: "Fuso horário inválido. Usa um identificador IANA, por exemplo Africa/Luanda." }, { status: 400 }); }
  }
  if (terms !== undefined && (!Number.isInteger(terms) || terms < 0 || terms > 365)) return NextResponse.json({ error: "O prazo padrão de pagamento deve estar entre 0 e 365 dias." }, { status: 400 });
  if (invoicePrefix === null || quotePrefix === null) return NextResponse.json({ error: "Os prefixos dos documentos não podem ficar vazios." }, { status: 400 });

  const data = {
    ...(name !== undefined && { name }),
    ...(legalName !== undefined && { legalName }),
    ...(taxId !== undefined && { taxId }),
    ...(email !== undefined && { email }),
    ...(phone !== undefined && { phone }),
    ...(website !== undefined && { website }),
    ...(addressLine1 !== undefined && { addressLine1 }),
    ...(addressLine2 !== undefined && { addressLine2 }),
    ...(city !== undefined && { city }),
    ...(postalCode !== undefined && { postalCode }),
    ...(country !== undefined && country && { country }),
    ...(currency !== undefined && currency && { currency }),
    ...(timezone !== undefined && timezone && { timezone }),
    ...(locale !== undefined && locale && { locale }),
    ...(terms !== undefined && { defaultPaymentTerms: terms }),
    ...(invoicePrefix !== undefined && invoicePrefix && { invoicePrefix }),
    ...(quotePrefix !== undefined && quotePrefix && { quotePrefix }),
    ...(invoiceNotes !== undefined && { invoiceNotes }),
    ...(invoiceTerms !== undefined && { invoiceTerms }),
  };

  const organizationId = current.membership.organizationId;
  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data,
    select: fields,
  });
  await audit({
    action: "organization.settings.updated",
    userId: current.user.id,
    organizationId,
    entityType: "Organization",
    entityId: organizationId,
    metadata: { changedFields: Object.keys(data) },
  });
  return NextResponse.json({ organization });
}
