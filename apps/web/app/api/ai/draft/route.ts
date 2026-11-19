import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { checkAiQuota } from "@/lib/plan-access";
import { askAnthropicTool, AiUnavailableError } from "@/lib/ai/anthropic";
import { buildDraftSystem, DRAFT_TOOL, sanitizeProposal, type ModelProposal } from "@/lib/ai/draft";

export const runtime = "nodejs";
export const maxDuration = 40;

const QUOTA_TEXT = {
  NO_AI_IN_PLAN: "O teu plano não inclui o InvoiceFlow AI. Faz upgrade para o activar.",
  LIMIT_REACHED: "Atingiste o limite mensal de mensagens de IA do teu plano.",
  SUBSCRIPTION_INACTIVE: "A subscrição não está activa. Consulta a área de facturação.",
} as const;

/** Interprets free text ("factura 3 horas de suporte à Clínica X") into a validated draft PROPOSAL. Writes nothing but the usage record. */
export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try {
    assertCan(current.membership.role, "ai:write");
    assertCan(current.membership.role, "invoices:write");
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }

  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 5) return NextResponse.json({ error: "Descreve o que queres facturar." }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Texto demasiado longo (máx. 1000 caracteres)." }, { status: 400 });

  const { organizationId, organization } = current.membership;
  const quota = await checkAiQuota(organizationId);
  if (!quota.allowed) return NextResponse.json({ error: QUOTA_TEXT[quota.reason!], code: quota.reason, limit: quota.limit, used: quota.used }, { status: 402 });

  const orgCurrency = organization.currency || "AOA";
  const [clientRows, productRows] = await Promise.all([
    prisma.client.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, currency: true } }),
    prisma.product.findMany({ where: { organizationId, archivedAt: null }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, unitPrice: true, currency: true } }),
  ]);
  const clients = clientRows;
  const products = productRows.map(p => ({ id: p.id, name: p.name, unitPrice: Number(p.unitPrice), currency: p.currency }));

  let proposal;
  try {
    const raw = await askAnthropicTool<ModelProposal>(buildDraftSystem(clients, products, orgCurrency), text, DRAFT_TOOL);
    proposal = sanitizeProposal(raw, clients, products, orgCurrency);
  } catch (error) {
    if (error instanceof AiUnavailableError) return NextResponse.json({ error: "O assistente de IA não está disponível neste momento. Tenta novamente mais tarde." }, { status: 503 });
    console.error("[ai/draft]", error);
    return NextResponse.json({ error: "Não foi possível interpretar o pedido." }, { status: 500 });
  }

  const conversation = await prisma.aiConversation.create({
    data: { organizationId, userId: current.user.id, title: `Rascunho: ${text.slice(0, 50)}` }, select: { id: true },
  });
  const base = Date.now();
  await prisma.aiMessage.createMany({ data: [
    { conversationId: conversation.id, role: "user", content: text, createdAt: new Date(base) },
    { conversationId: conversation.id, role: "assistant", content: JSON.stringify(proposal), createdAt: new Date(base + 1) },
  ] });
  await audit({ organizationId, userId: current.user.id, action: "ai.draft", entityType: "AiConversation", entityId: conversation.id }).catch(() => {});

  return NextResponse.json({ proposal, clients: clients.map(c => ({ id: c.id, name: c.name })), used: quota.used + 1, limit: quota.limit });
}
