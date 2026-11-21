import { NextResponse } from "next/server";
import { audit } from "@/lib/auth/session";
import { requirePlatformAdmin } from "@/lib/billing/admin-guard";
import { SETTING_KEYS, savePaySettings, type PaySettings } from "@/lib/billing/manual";

export const runtime = "nodejs";

/** Dados que os clientes veem ao pagar (IBAN, Multicaixa Express) e o WhatsApp onde recebes os comprovativos. */
export async function PUT(request: Request) {
  const g = await requirePlatformAdmin(); if ("error" in g) return g.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const values: Partial<PaySettings> = {};
  for (const key of SETTING_KEYS) if (typeof body[key] === "string") values[key] = body[key] as string;
  if (values.admin_whatsapp && values.admin_whatsapp.replace(/\D/g, "").length < 9) return NextResponse.json({ error: "Número de WhatsApp inválido. Usa o formato internacional, ex.: 244923000000." }, { status: 400 });
  await savePaySettings(values);
  await audit({ userId: g.current.user.id, action: "billing.settings.updated", entityType: "PlatformSetting", metadata: { keys: Object.keys(values) } });
  return NextResponse.json({ ok: true });
}
