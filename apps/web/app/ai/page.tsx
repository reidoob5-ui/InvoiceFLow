import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles, Lock } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { checkAiQuota } from "@/lib/plan-access";
import AiWorkspace from "./ai-workspace";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.membership) redirect("/onboarding");
  if (!can(current.membership.role, "ai:read")) redirect("/dashboard");
  const { organizationId } = current.membership;
  const quota = await checkAiQuota(organizationId);
  const last = await prisma.aiConversation.findFirst({
    where: { organizationId, userId: current.user.id }, orderBy: { updatedAt: "desc" },
    select: { id: true, messages: { orderBy: { createdAt: "asc" }, take: 40, select: { id: true, role: true, content: true } } },
  });
  const canWrite = can(current.membership.role, "ai:write");

  if (!quota.allowed && quota.reason === "NO_AI_IN_PLAN") {
    return <div className="mx-auto max-w-2xl rounded-3xl border border-indigo-300/15 bg-gradient-to-br from-indigo-500/10 to-cyan-500/5 p-8 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-400/15 text-indigo-200"><Lock size={24}/></span>
      <h1 className="mt-5 text-2xl font-semibold">InvoiceFlow AI</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">Pergunta ao assistente quanto tens por receber, que clientes estão em atraso e pede mensagens de cobrança prontas. Disponível a partir do plano pago ({quota.planName} não inclui IA).</p>
      <Link href="/plans" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950"><Sparkles size={15}/> Ver planos</Link>
    </div>;
  }
  return <AiWorkspace conversationId={last?.id ?? null} initial={last?.messages ?? []} used={quota.used} limit={quota.limit} canWrite={canWrite} blocked={quota.allowed ? null : (quota.reason ?? null)} />;
}
