"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";

type Summary = {
  plan: { key: string; name: string; monthlyPrice: string | number; currency: string; limits: { maxUsers: number | null; maxClients: number | null; maxInvoicesPerMonth: number | null } };
  subscription: { status: string; interval: string; trialEndsAt: string | null; currentPeriodEnd: string | null; hasAccess: boolean };
  usage: { users: number; clients: number; invoices: number };
  billingProviderConfigured: boolean;
};

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const percent = limit === null ? 0 : Math.min(100, limit === 0 ? 100 : used / limit * 100);
  return <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-200">{label}</p><p className="text-xs tabular-nums text-slate-400">{used} / {limit === null ? "Ilimitado" : limit}</p></div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300" style={{ width: limit === null ? "8%" : percent + "%" }}/></div>
  </div>;
}

export default function BillingOverview() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/summary")
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível carregar a subscrição."); return body as Summary; })
      .then(body => { if (active) setData(body); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Erro inesperado."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-6 text-sm text-slate-400"><RefreshCw size={16} className="animate-spin"/> A carregar a tua subscrição…</div>;
  if (error) return <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;
  if (!data) return null;

  const price = new Intl.NumberFormat("pt-AO", { style: "currency", currency: data.plan.currency, maximumFractionDigits: 0 }).format(Number(data.plan.monthlyPrice));
  const statusLabel: Record<string, string> = { ACTIVE: "Activo", TRIALING: "Período experimental", PAST_DUE: "Pagamento pendente", CANCELED: "Cancelado", EXPIRED: "Expirado" };

  return <div className="mx-auto max-w-5xl space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-indigo-300">Conta e pagamentos</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Plano e subscrição</h1><p className="mt-2 text-sm text-slate-400">Consulta o teu plano, utilização e estado da subscrição.</p></div><Link href="/plans" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-indigo-100">Ver outros planos <ArrowUpRight size={16}/></Link></div>

    <section className="relative overflow-hidden rounded-[1.8rem] border border-indigo-300/20 bg-gradient-to-br from-indigo-500/15 via-[#111a30] to-[#0b1220] p-6 sm:p-8">
      <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl"/>
      <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div><div className="flex items-center gap-2 text-indigo-200"><CreditCard size={17}/><span className="text-xs font-semibold uppercase tracking-[.18em]">Plano actual</span></div><h2 className="mt-3 text-3xl font-semibold text-white">{data.plan.name}</h2><p className="mt-2 text-sm text-slate-400">{Number(data.plan.monthlyPrice) === 0 ? "Sem custos" : price + " / mês"}</p></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Estado</p><p className={`mt-2 text-sm font-semibold ${data.subscription.hasAccess ? "text-emerald-300" : "text-rose-300"}`}>{statusLabel[data.subscription.status] || data.subscription.status}</p></div>
      </div>
      {!data.subscription.hasAccess && <p className="relative mt-6 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-200">O acesso de escrita está suspenso até regularizares a subscrição.</p>}
    </section>

    <section><div className="mb-4"><h2 className="text-lg font-semibold text-white">Utilização deste espaço</h2><p className="mt-1 text-xs text-slate-500">Os limites são aplicados no servidor para proteger a tua conta.</p></div><div className="grid gap-3 md:grid-cols-3"><Usage label="Utilizadores activos" used={data.usage.users} limit={data.plan.limits.maxUsers}/><Usage label="Clientes activos" used={data.usage.clients} limit={data.plan.limits.maxClients}/><Usage label="Facturas criadas este mês" used={data.usage.invoices} limit={data.plan.limits.maxInvoicesPerMonth}/></div></section>

    <section className="rounded-2xl border border-white/[.08] bg-white/[.025] p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 text-emerald-300"/><div><h2 className="text-sm font-semibold text-white">Pagamentos e segurança</h2><p className="mt-2 text-xs leading-6 text-slate-400">{data.billingProviderConfigured ? "O fornecedor de pagamentos está configurado." : "A cobrança automática ainda não está ligada a um fornecedor de pagamentos. Não será apresentada uma confirmação falsa de pagamento."}</p><p className="mt-2 text-[11px] text-slate-500">A moeda da subscrição é independente da moeda contabilística da tua empresa.</p></div></div></section>
  </div>;
}
