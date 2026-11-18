"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CreditCard, RefreshCw, ShieldCheck, Globe, QrCode, Smartphone, ExternalLink } from "lucide-react";
import { DEFAULT_PLANS } from "@/lib/plans";

type Summary = {
  plan: { key: string; name: string; monthlyPrice: string | number; currency: string; limits: { maxUsers: number | null; maxClients: number | null; maxInvoicesPerMonth: number | null } };
  subscription: { status: string; interval: string; trialEndsAt: string | null; currentPeriodEnd: string | null; hasAccess: boolean };
  usage: { users: number; clients: number; invoices: number };
  billingProviderConfigured: boolean;
  billingProviders: { multicaixa: boolean; international: boolean };
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
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [checkoutLoading, setCheckoutLoading] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [multicaixaCheckout, setMulticaixaCheckout] = useState<{ qrCodeUrl: string; deeplinkRedirect: string | null; expiresAt: string } | null>(null);

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
  const selected = DEFAULT_PLANS.find(plan => plan.key === selectedPlan);
  async function beginCheckout(provider: "multicaixa" | "international") {
    setCheckoutError(""); setMulticaixaCheckout(null); setCheckoutLoading(provider);
    try {
      const response = await fetch(provider === "multicaixa" ? "/api/billing/checkout/multicaixa" : "/api/billing/checkout/international", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: selectedPlan, interval }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível iniciar o pagamento.");
      if (provider === "international" && typeof result.checkoutUrl === "string") { window.location.assign(result.checkoutUrl); return; }
      if (provider === "multicaixa" && typeof result.qrCodeUrl === "string") setMulticaixaCheckout(result);
      else throw new Error("O fornecedor não devolveu os dados de pagamento esperados.");
    } catch (reason) { setCheckoutError(reason instanceof Error ? reason.message : "Erro inesperado."); }
    finally { setCheckoutLoading(""); }
  }
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

    <section className="rounded-2xl border border-indigo-300/20 bg-gradient-to-br from-indigo-500/10 to-white/[.02] p-5 sm:p-6">
      <div><h2 className="text-lg font-semibold text-white">Renovar ou mudar de plano</h2><p className="mt-1 text-xs text-slate-400">Escolhe o plano e o canal de pagamento. O acesso só é actualizado depois da confirmação do fornecedor.</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">Plano
          <select value={selectedPlan} onChange={event=>setSelectedPlan(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a30] px-3 py-3 text-sm text-white">
            {DEFAULT_PLANS.filter(plan=>plan.key!=="free").map(plan=><option key={plan.key} value={plan.key}>{plan.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">Periodicidade
          <select value={interval} onChange={event=>setInterval(event.target.value as "MONTHLY"|"YEARLY")} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a30] px-3 py-3 text-sm text-white">
            <option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option>
          </select>
        </label>
      </div>
      {selected && <p className="mt-3 text-sm font-semibold text-white">{new Intl.NumberFormat("pt-AO",{style:"currency",currency:"AOA",maximumFractionDigits:0}).format(interval==="YEARLY"?selected.yearlyPrice:selected.monthlyPrice)} <span className="text-xs font-normal text-slate-500">/ {interval==="YEARLY"?"ano":"mês"}</span></p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={!data.billingProviders.multicaixa||!!checkoutLoading} onClick={()=>beginCheckout("multicaixa")} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><Smartphone size={17}/>{checkoutLoading==="multicaixa"?"A preparar…":"Pagar com MULTICAIXA"}</button>
        <button type="button" disabled={!data.billingProviders.international||!!checkoutLoading} onClick={()=>beginCheckout("international")} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><Globe size={17}/>{checkoutLoading==="international"?"A preparar…":"Pagar internacionalmente"}</button>
      </div>
      {!data.billingProviders.multicaixa && <p className="mt-3 text-xs text-amber-200">MULTICAIXA aguarda credenciais e adesão comercial EMIS/ProxyPay.</p>}
      {!data.billingProviders.international && <p className="mt-2 text-xs text-amber-200">Checkout internacional aguarda conta Paddle, catálogo de preços e chave de webhook.</p>}
      {checkoutError && <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-200">{checkoutError}</p>}
      {multicaixaCheckout && <div className="mt-5 flex flex-col items-center rounded-2xl border border-white/10 bg-black/20 p-5 text-center">
        <QrCode size={22} className="text-emerald-300"/><p className="mt-2 text-sm font-semibold text-white">Confirma o pagamento no MULTICAIXA Express</p>
        <img src={multicaixaCheckout.qrCodeUrl} alt="Código QR de pagamento MULTICAIXA" className="mt-4 h-52 w-52 rounded-xl bg-white p-2"/>
        {multicaixaCheckout.deeplinkRedirect && <a href={multicaixaCheckout.deeplinkRedirect} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950">Abrir MULTICAIXA Express <ExternalLink size={15}/></a>}
        <p className="mt-3 text-[11px] text-slate-500">Expira em {new Intl.DateTimeFormat("pt-AO",{dateStyle:"short",timeStyle:"short"}).format(new Date(multicaixaCheckout.expiresAt))}. O plano só será activado após confirmação do banco.</p>
      </div>}
    </section>

    <section className="rounded-2xl border border-white/[.08] bg-white/[.025] p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 text-emerald-300"/><div><h2 className="text-sm font-semibold text-white">Pagamentos e segurança</h2><p className="mt-2 text-xs leading-6 text-slate-400">{data.billingProviders.multicaixa ? "MULTICAIXA está configurado." : "MULTICAIXA ainda aguarda credenciais de comerciante."} {data.billingProviders.international ? "Paddle está configurado." : "Paddle ainda aguarda credenciais e preços."}</p><p className="mt-2 text-[11px] text-slate-500">A moeda da subscrição é independente da moeda contabilística da tua empresa.</p></div></div></section>
  </div>;
}
