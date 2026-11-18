import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { createPaddleCheckout, paddlePriceId } from "@/lib/payments/paddle";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try {
    assertCan(current.membership.role, "billing:write");
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Apenas o proprietário pode alterar a subscrição." }, { status: 403 });
    throw error;
  }

  let body: { planKey?: string; interval?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); }
  const planKey = typeof body.planKey === "string" ? body.planKey : "";
  const interval = body.interval === "YEARLY" ? "YEARLY" : body.interval === "MONTHLY" ? "MONTHLY" : null;
  if (!/^[a-z0-9_-]{2,40}$/.test(planKey) || !interval) return NextResponse.json({ error: "Plano ou periodicidade inválidos." }, { status: 400 });

  const plan = await prisma.plan.findFirst({ where: { key: planKey, isPublic: true } });
  if (!plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const priceId = paddlePriceId(planKey, interval);
  if (!priceId) return NextResponse.json({ error: "Este preço ainda não foi configurado no catálogo Paddle." }, { status: 503 });

  try {
    const checkoutUrl = await createPaddleCheckout({
      priceId,
      organizationId: current.membership.organizationId,
      planKey,
      interval,
    });
    return NextResponse.json({ provider: "PADDLE", checkoutUrl, status: "PENDING" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível iniciar o checkout internacional." }, { status: 502 });
  }
}
