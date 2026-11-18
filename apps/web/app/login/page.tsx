"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router=useRouter();
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [code,setCode]=useState("");
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password,code})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível iniciar sessão.");
      router.push(data.activeOrganizationId?"/dashboard":"/onboarding");
    }catch(err){setError(err instanceof Error?err.message:"Erro inesperado.");}finally{setBusy(false);}
  }
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-5 py-12 text-white">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(99,102,241,.25),transparent_55%)] opacity-[.12]"/>
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(7,11,20,.98),rgba(7,11,20,.84),rgba(7,11,20,.96))]"/>
    <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]"/>
    <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-[120px]"/>
    <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#101827]/80 shadow-2xl shadow-black/60 backdrop-blur-2xl lg:grid-cols-[1fr_.9fr]">
      <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden border-r border-white/10 p-10 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(99,102,241,.25),transparent_55%)] opacity-20"/>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/80 via-[#0b1220]/75 to-cyan-950/60"/>
        <div className="relative"><Link href="/" className="inline-flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 via-violet-500 to-cyan-400 text-xl font-black">I</span><span className="text-lg font-bold">InvoiceFlow</span></Link></div>
        <div className="relative"><span className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200/20 bg-indigo-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-indigo-100"><Sparkles size={13}/> Finance, in motion</span><h2 className="max-w-md text-4xl font-semibold leading-tight">O teu negócio merece uma visão mais clara.</h2><p className="mt-5 max-w-sm text-sm leading-7 text-slate-300">Facturação, clientes e recebimentos reunidos num espaço feito para simplificar o teu dia.</p></div>
        <p className="relative text-[10px] tracking-wide text-slate-500">Uma experiência InvoiceFlow, feita para crescer contigo.</p>
      </div>
      <form onSubmit={submit} className="p-7 sm:p-10 lg:p-12">
        <Link href="/" className="mb-9 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14}/> Página inicial</Link>
        <div className="mb-8"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 via-violet-500 to-cyan-400 text-xl font-black lg:hidden">I</div><p className="text-xs font-semibold uppercase tracking-[.2em] text-indigo-300">Área reservada</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Bem-vindo de volta.</h1><p className="mt-2 text-sm text-slate-400">Entra no teu espaço financeiro.</p></div>
        <label className="mb-2 block text-sm text-slate-300">E-mail</label><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mb-5 w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3.5 outline-none transition focus:border-indigo-400"/>
        <label className="mb-2 block text-sm text-slate-300">Palavra-passe</label><input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mb-5 w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3.5 outline-none transition focus:border-indigo-400"/>
        <label className="mb-2 block text-sm text-slate-300">Código 2FA <span className="text-slate-500">(se activado)</span></label><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} className="mb-5 w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3.5 outline-none transition focus:border-indigo-400"/>
        {error&&<p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-4 text-sm font-bold shadow-lg shadow-indigo-950/50 transition hover:-translate-y-0.5 disabled:opacity-50">{busy?"A entrar…":"Entrar na minha conta"}</button>
        <div className="mt-5 flex items-center justify-center gap-4 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><LockKeyhole size={12}/> Ligação segura</span><span className="flex items-center gap-1.5"><ShieldCheck size={12}/> Dados protegidos</span></div>
        <p className="mt-7 text-center text-sm text-slate-400">Ainda não tens conta? <Link className="font-semibold text-indigo-300 hover:text-white" href="/plans">Ver planos e registar</Link></p>
      </form>
    </div>
  </main>;
}