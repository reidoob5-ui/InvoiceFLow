"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
const planNames:Record<string,string>={free:"Gratuito",pro:"Pro",business:"Business"};\nconst planPrices:Record<string,string>={free:"Sem custos",pro:"19.000 Kz / mês",business:"32.000 Kz / mês"};
export default function RegisterForm({selectedPlanKey}:{selectedPlanKey:string}){
 const router=useRouter();const [name,setName]=useState("");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{
  const response=await fetch("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,email,password,planKey:selectedPlanKey})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível criar a conta.");
  router.push("/onboarding?plan="+encodeURIComponent(data.planKey||selectedPlanKey));
 }catch(err){setError(err instanceof Error?err.message:"Erro inesperado.");}finally{setBusy(false);}}
 return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-5 py-12 text-white">
  <div className="pointer-events-none absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1800&q=80')] bg-cover bg-center opacity-[.11]"/><div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070b14]/95 via-[#070b14]/80 to-[#070b14]/95"/><div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]"/><div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-[120px]"/>
  <form onSubmit={submit} className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#101827]/90 p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl sm:p-10">
   <Link href="/plans" className="mb-8 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14}/> Voltar aos planos</Link>
   <div className="mb-8"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 via-violet-500 to-cyan-400 text-xl font-black">I</div><p className="text-[10px] font-bold uppercase tracking-[.25em] text-indigo-300">O teu próximo passo</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Cria a tua conta.</h1><p className="mt-2 text-sm text-slate-400">Vamos preparar o teu espaço financeiro.</p></div>
   <div className="mb-6 flex items-center justify-between rounded-2xl border border-indigo-300/20 bg-indigo-400/[.08] p-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">Plano seleccionado</p><p className="mt-1 font-semibold text-indigo-100">{planNames[selectedPlanKey]||"Gratuito"}</p><p className="mt-1 text-xs text-slate-400">{planPrices[selectedPlanKey]||"Sem custos"}</p></div><Link href="/plans" className="text-xs font-semibold text-indigo-300 hover:text-white">Alterar</Link></div>
   <label className="mb-2 block text-sm text-slate-300">Nome completo</label><input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3.5 outline-none transition focus:border-indigo-400"/>
   <label className="mb-2 block text-sm text-slate-300">E-mail</label><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3.5 outline-none transition focus:border-indigo-400"/>
   <label className="mb-2 block text-sm text-slate-300">Palavra-passe</label><input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3.5 outline-none transition focus:border-indigo-400"/><p className="mb-5 mt-2 text-xs text-slate-500">Mínimo de 10 caracteres e variedade de caracteres.</p>
   {error&&<p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
   <button disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-4 text-sm font-bold shadow-lg shadow-indigo-950/50 transition hover:-translate-y-0.5 disabled:opacity-50">{busy?"A criar conta…":"Criar conta e continuar"}</button>
   <div className="mt-5 flex items-center justify-center gap-4 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><LockKeyhole size={12}/> Ligação segura</span><span className="flex items-center gap-1.5"><ShieldCheck size={12}/> Dados protegidos</span></div>
   <p className="mt-6 text-center text-sm text-slate-400">Já tens conta? <Link className="font-semibold text-indigo-300 hover:text-white" href="/login">Entrar</Link></p>
  </form>
 </main>;
}