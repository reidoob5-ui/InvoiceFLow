"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Crown, Rocket, Sparkles, RefreshCw } from "lucide-react";
import { DEFAULT_PLANS } from "@/lib/plans";

const preferredCurrencies = ["AOA","USD","EUR","GBP","BRL","ZAR","MZN","NAD","NGN","XAF","XOF","KES","GHS","CAD","AUD","CHF","JPY","CNY","INR","AED"] as const;
const presentation = {
  free: { icon: Sparkles, subtitle: "Para começar com organização", features: ["Até 5 facturas por mês","Até 10 clientes","1 utilizador e 1 empresa","Facturas e documentos PDF","Gestão básica de clientes"] },
  pro: { icon: Rocket, subtitle: "Para negócios em crescimento", features: ["Até 50 facturas por mês","Até 100 clientes","Até 2 utilizadores","Produtos, serviços e fornecedores","Impostos e taxas configuráveis","Importação e exportação CSV","Registo de pagamentos"] },
  business: { icon: Crown, subtitle: "Para equipas e operações maiores", features: ["Até 500 facturas por mês","Até 1.000 clientes","Até 5 utilizadores","Até 3 espaços de empresa","Tudo do plano Pro","Controlo avançado de operações","Acesso prioritário a novas funções"] },
};

export default function PlanPicker() {
  const [currency,setCurrency] = useState("AOA");
  const [rates,setRates] = useState<Record<string,number>>({AOA:1});
  const [updatedAt,setUpdatedAt] = useState<string|null>(null);
  const [ratesReady,setRatesReady] = useState(false);
  const [ratesUnavailable,setRatesUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/public/exchange-rates?base=AOA")
      .then(async response => { if(!response.ok) throw new Error("rates unavailable"); return response.json(); })
      .then(data => {
        if(!active || !data.rates) return;
        const valid = Object.fromEntries(Object.entries(data.rates).filter(([code,value]) => /^[A-Z]{3}$/.test(code) && typeof value === "number" && Number.isFinite(value) && value > 0));
        setRates({AOA:1,...valid});
        setUpdatedAt(typeof data.updatedAt === "string" ? data.updatedAt : null);
      })
      .catch(() => { if(active) setRatesUnavailable(true); })
      .finally(() => { if(active) setRatesReady(true); });
    return () => { active=false; };
  },[]);

  const plans = useMemo(() => DEFAULT_PLANS.filter(p => ["free","pro","business"].includes(p.key)),[]);
  const availableCurrencies = preferredCurrencies.filter(code => code === "AOA" || Boolean(rates[code]));
  const shownCurrency = rates[currency] ? currency : "AOA";
  const format = (amount:number, code:string) => new Intl.NumberFormat(code==="AOA"?"pt-AO":undefined,{style:"currency",currency:code,maximumFractionDigits:code==="AOA"?0:2}).format(amount*(rates[code]||1));

  return <div className="mt-12">
    <div className="mb-7 flex flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="text-center sm:text-left"><p className="text-sm font-semibold">Pagamento mensal</p><p className="mt-1 text-xs text-slate-500">Sem compromisso anual obrigatório.</p></div>
      <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-xs text-slate-300"><span>Ver preços em</span>
        <select value={shownCurrency} onChange={event=>setCurrency(event.target.value)} disabled={!ratesReady} className="bg-transparent font-semibold text-white outline-none">
          <option className="bg-slate-900" value="AOA">Kwanza (AOA)</option>
          {availableCurrencies.filter(code=>code!=="AOA").map(code=><option className="bg-slate-900" key={code} value={code}>{code}</option>)}
        </select>
      </label>
    </div>
    <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-500 sm:justify-end">
      {ratesReady && !ratesUnavailable && updatedAt && <span>Taxas de referência actualizadas: {new Intl.DateTimeFormat("pt-PT",{dateStyle:"medium"}).format(new Date(updatedAt))}</span>}
      {!ratesReady && <span className="inline-flex items-center gap-2"><RefreshCw size={12} className="animate-spin"/> A carregar taxas de câmbio…</span>}
      {ratesUnavailable && <span className="text-amber-300">Taxas indisponíveis neste momento. Os preços em Kz continuam disponíveis.</span>}
    </div>
    <div className="grid gap-5 lg:grid-cols-3">{plans.map(plan=>{
      const item=presentation[plan.key as keyof typeof presentation]; const Icon=item.icon; const featured=plan.key==="pro"; const amount=plan.monthlyPrice;
      return <article key={plan.key} className={`relative flex flex-col rounded-[1.8rem] border p-6 transition duration-300 hover:-translate-y-2 ${featured?"border-indigo-300/50 bg-gradient-to-b from-indigo-500/20 via-[#111a30] to-[#0d1422] shadow-[0_25px_70px_rgba(79,70,229,.18)]":"border-white/10 bg-gradient-to-b from-white/[.06] to-white/[.015]"}`}>
        {featured&&<span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 px-4 py-1.5 text-[10px] font-black uppercase tracking-[.15em]">Mais escolhido</span>}
        <div className="flex items-center justify-between"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${featured?"bg-indigo-400/20 text-indigo-200":"bg-white/[.07] text-slate-200"}`}><Icon size={22}/></span><span className="text-[10px] font-bold uppercase tracking-[.2em] text-slate-500">{plan.key==="free"?"Começar":plan.key==="pro"?"Crescer":"Expandir"}</span></div>
        <h2 className="mt-6 text-2xl font-semibold">{plan.name}</h2><p className="mt-2 min-h-10 text-sm text-slate-400">{item.subtitle}</p>
        <div className="mt-6 flex items-end gap-2"><span className="text-4xl font-semibold tracking-tight">{amount===0?"Grátis":format(amount,shownCurrency)}</span>{amount>0&&<span className="pb-1 text-xs text-slate-500">/ mês</span>}</div>
        {amount>0&&shownCurrency!=="AOA"&&<p className="mt-1 text-[11px] text-slate-500">Preço base: {format(amount,"AOA")}</p>}
        <Link href={`/register?plan=${plan.key}`} className={`mt-7 flex items-center justify-center rounded-xl px-4 py-3.5 text-sm font-bold transition ${featured?"bg-white text-slate-950 hover:bg-indigo-100":"border border-white/15 bg-white/[.06] text-white hover:bg-white/10"}`}>{plan.key==="free"?"Começar gratuitamente":"Escolher este plano"}</Link>
        <div className="my-6 h-px bg-white/10"/><p className="mb-4 text-xs font-semibold text-slate-300">O que está incluído</p>
        <ul className="space-y-3">{item.features.map(feature=><li key={feature} className="flex gap-3 text-xs leading-5 text-slate-400"><Check size={15} className="mt-0.5 shrink-0 text-emerald-300"/>{feature}</li>)}</ul>
      </article>;
    })}</div>
  </div>;
}