"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, Sparkles } from "lucide-react";
import { DEFAULT_PLANS } from "@/lib/plans";
const planNames:Record<string,string> = Object.fromEntries(DEFAULT_PLANS.map(plan => [plan.key, plan.name]));
const planPrices:Record<string,string> = Object.fromEntries(DEFAULT_PLANS.map(plan => [plan.key, plan.monthlyPrice === 0 ? "Sem custos" : new Intl.NumberFormat("pt-AO", { style:"currency", currency:plan.currency, maximumFractionDigits:0 }).format(plan.monthlyPrice) + " / mês"]));
const planTrials:Record<string,string> = Object.fromEntries(DEFAULT_PLANS.filter(plan => plan.trialDays > 0).map(plan => [plan.key, `${plan.trialDays} dias de avaliação incluídos`]));
export default function OnboardingForm({planKey}:{planKey:string}){
 const router=useRouter();const [name,setName]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{
  const response=await fetch("/api/organizations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,planKey})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível criar a empresa.");
  router.push("/dashboard");router.refresh();
 }catch(err){setError(err instanceof Error?err.message:"Erro inesperado.");}finally{setBusy(false);}}
 return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-5 py-12 text-white">
  <div className="pointer-events-none absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=80')] bg-cover bg-center opacity-[.11]"/><div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070b14]/95 via-[#070b14]/80 to-[#070b14]/95"/><div className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]"/>
  <form onSubmit={submit} className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#101827]/90 p-8 shadow-2xl backdrop-blur-2xl sm:p-10">
   <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14}/> Página inicial</Link>
   <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-cyan-400 text-white"><Building2 size={23}/></span>
   <p className="text-[10px] font-bold uppercase tracking-[.25em] text-indigo-300">Último passo</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Vamos configurar a tua empresa.</h1><p className="mt-3 text-sm leading-6 text-slate-400">Dá um nome ao teu espaço de trabalho. Podes completar os restantes dados depois.</p>
   <div className="my-7 flex items-center gap-3 rounded-2xl border border-indigo-300/20 bg-indigo-400/[.08] p-4"><Sparkles size={18} className="text-indigo-200"/><div><p className="text-[10px] uppercase tracking-[.16em] text-slate-500">Plano seleccionado</p><p className="mt-1 text-sm font-semibold text-indigo-100">{planNames[planKey]||"Gratuito"}</p><p className="mt-1 text-xs text-slate-400">{planPrices[planKey]||"Sem custos"}</p>{planTrials[planKey]&&<p className="mt-1 text-[11px] text-emerald-300">{planTrials[planKey]}</p>}</div></div>
   <label className="mb-2 block text-sm text-slate-300">Nome da empresa</label><input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Minha Empresa, Lda." className="mb-5 w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3.5 outline-none transition focus:border-indigo-400"/>
   {error&&<p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
   <button disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-4 text-sm font-bold shadow-lg shadow-indigo-950/50 transition hover:-translate-y-0.5 disabled:opacity-50">{busy?"A preparar o teu espaço…":"Criar empresa e entrar"}</button>
  </form>
 </main>;
}