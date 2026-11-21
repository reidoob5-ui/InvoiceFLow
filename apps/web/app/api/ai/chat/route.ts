import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession, audit } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { checkAiQuota } from "@/lib/plan-access";
import { buildFinancialContext } from "@/lib/ai/context";
import { askAnthropic, buildSystemPrompt, AiUnavailableError, type ChatTurn } from "@/lib/ai/anthropic";

export const runtime = "nodejs";
export const maxDuration = 40;

const QUOTA_TEXT = {
  NO_AI_IN_PLAN: "O teu plano não inclui o InvoiceFlow AI. Faz upgrade para o activar.",
  LIMIT_REACHED: "Atingiste o limite mensal de mensagens de IA do teu plano.",
  SUBSCRIPTION_INACTIVE: "A subscrição não está activa. Consulta a área de facturação.",
} as const;

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "ai:write"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }

  const body = await request.json().catch(() => null) as { message?: unknown; conversationId?: unknown; page?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Escreve uma pergunta." }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: "Mensagem demasiado longa (máx. 2000 caracteres)." }, { status: 400 });

  const { organizationId, organization } = current.membership;
  const quota = await checkAiQuota(organizationId);
  if (!quota.allowed) return NextResponse.json({ error: QUOTA_TEXT[quota.reason!], code: quota.reason, limit: quota.limit, used: quota.used }, { status: 402 });

  let conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  let history: ChatTurn[] = [];
  if (conversationId) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: conversationId, organizationId, userId: current.user.id },
      select: { id: true, messages: { orderBy: { createdAt: "desc" }, take: 10, select: { role: true, content: true } } },
    });
    if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    history = conversation.messages.reverse().map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  }

  let reply: string;
  try {
    const context = await buildFinancialContext(organizationId, organization.name, organization.currency || "AOA");
    reply = await askAnthropic(buildSystemPrompt(context, typeof body?.page === "string" && /^\/[a-z0-9/_-]{0,60}$/i.test(body.page) ? body.page : undefined), [...history, { role: "user", content: message }]);
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ error: "O assistente de IA não está disponível neste momento. Tenta novamente mais tarde." }, { status: 503 });
    }
    console.error("[ai/chat]", error);
    return NextResponse.json({ error: "Não foi possível obter resposta da IA." }, { status: 500 });
  }

  if (!conversationId) {
    const created = await prisma.aiConversation.create({
      data: { organizationId, userId: current.user.id, title: message.slice(0, 60) },
      select: { id: true },
    });
    conversationId = created.id;
  }
  const base = Date.now();
  await prisma.$transaction([
    prisma.aiMessage.create({ data: { conversationId, role: "user", content: message, createdAt: new Date(base) } }),
    prisma.aiMessage.create({ data: { conversationId, role: "assistant", content: reply, createdAt: new Date(base + 1) } }),
    prisma.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);
  await audit({ organizationId, userId: current.user.id, action: "ai.message", entityType: "AiConversation", entityId: conversationId }).catch(() => {});

  return NextResponse.json({ conversationId, reply, used: quota.used + 1, limit: quota.limit });
}
