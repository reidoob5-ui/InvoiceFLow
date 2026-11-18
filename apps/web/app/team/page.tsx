"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, MailPlus, RefreshCw, ShieldCheck, Users, Clock3 } from "lucide-react";

type Member = { id:string; role:string; status:string; createdAt:string; user:{id:string;name:string;email:string;lastLoginAt:string|null} };
type Invitation = { id:string; email:string; role:string; expiresAt:string; createdAt:string };

const roleLabels:Record<string,string> = { OWNER:"Proprietário", ADMIN:"Administrador", ACCOUNTANT:"Contabilista", SALES:"Comercial", MEMBER:"Membro" };

export default function TeamPage(){
 const [members,setMembers]=useState<Member[]>([]);
 const [invitations,setInvitations]=useState<Invitation[]>([]);
 const [email,setEmail]=useState("");
 const [role,setRole]=useState("MEMBER");
 const [inviteUrl,setInviteUrl]=useState("");
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [sending,setSending]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/team/invitations",{cache:"no-store"});
   const data=await response.json();
   if(!response.ok) throw new Error(data.error||"Não foi possível carregar a equipa.");
   setMembers(data.members||[]);setInvitations(data.invitations||[]);
  }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar a equipa.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function invite(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setSending(true);setError("");setNotice("");setInviteUrl("");
  try{
   const response=await fetch("/api/team/invitations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,role})});
   const data=await response.json();
   if(!response.ok) throw new Error(data.error||"Não foi possível criar o convite.");
   setInviteUrl(data.inviteUrl);setNotice(data.notice||"Convite criado.");setEmail("");await load();
  }catch(e){setError(e instanceof Error?e.message:"Falha ao criar convite.");}
  finally{setSending(false);}
 }
 async function copyLink(){
  try{await navigator.clipboard.writeText(inviteUrl);setNotice("Link copiado. Envia-o ao membro convidado.");}
  catch{setError("Não foi possível copiar automaticamente. Selecciona e copia o link.");}
 }
 return <div className="mx-auto max-w-6xl space-y-7">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={14}/> Voltar ao painel</Link><p className="text-[10px] font-bold uppercase tracking-[.22em] text-indigo-300">Administração</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Equipa e acessos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Gere os membros, define os seus perfis e convida pessoas para colaborar no espaço da empresa.</p></div><button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/[.08]"><RefreshCw size={14}/> Actualizar</button></div>
  {error&&<div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}
  <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
   <section className="rounded-2xl border border-white/10 bg-[#111a2b]/80 p-5 shadow-xl shadow-black/10">
    <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-400/10 text-indigo-200"><MailPlus size={19}/></span><div><h2 className="font-semibold">Convidar membro</h2><p className="mt-1 text-xs text-slate-500">O convite é válido durante 7 dias.</p></div></div>
    <form onSubmit={invite} className="space-y-4">
     <div><label className="mb-2 block text-xs font-medium text-slate-300">E-mail do membro</label><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@empresa.com" className="w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3 text-sm outline-none focus:border-indigo-400"/></div>
     <div><label className="mb-2 block text-xs font-medium text-slate-300">Perfil de acesso</label><select value={role} onChange={e=>setRole(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#080d18] px-4 py-3 text-sm outline-none focus:border-indigo-400"><option value="MEMBER">Membro</option><option value="SALES">Comercial</option><option value="ACCOUNTANT">Contabilista</option><option value="ADMIN">Administrador</option></select></div>
     <button disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3.5 text-sm font-bold shadow-lg shadow-indigo-950/30 disabled:opacity-50"><MailPlus size={16}/>{sending?"A criar convite…":"Criar convite"}</button>
    </form>
    {inviteUrl&&<div className="mt-5 rounded-xl border border-indigo-300/20 bg-indigo-400/[.07] p-4"><p className="mb-2 text-xs font-semibold text-indigo-100">Link privado do convite</p><p className="break-all rounded-lg bg-black/20 p-3 text-[11px] text-slate-300">{inviteUrl}</p><button onClick={()=>void copyLink()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-300/20 px-3 py-2 text-xs font-semibold text-indigo-100 hover:bg-indigo-300/10"><Copy size={13}/> Copiar link</button><p className="mt-3 text-[10px] leading-5 text-slate-500">Por enquanto, o envio automático de e-mail ainda não está ligado. Partilha este link apenas com a pessoa convidada.</p></div>}
   </section>
   <section className="rounded-2xl border border-white/10 bg-[#111a2b]/80 p-5 shadow-xl shadow-black/10">
    <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-200"><Users size={19}/></span><div><h2 className="font-semibold">Membros da empresa</h2><p className="mt-1 text-xs text-slate-500">{members.length} membro(s) registado(s)</p></div></div>
    {loading?<p className="py-8 text-center text-sm text-slate-500">A carregar equipa…</p>:members.length===0?<p className="py-8 text-center text-sm text-slate-500">Ainda não há membros.</p>:<div className="space-y-3">{members.map(member=><div key={member.id} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400/20 to-violet-400/20 text-sm font-bold text-indigo-100">{member.user.name.slice(0,1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.user.name}</p><p className="truncate text-xs text-slate-500">{member.user.email}</p></div><span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-300">{roleLabels[member.role]||member.role}</span></div>)}</div>}
   </section>
  </div>
  <section className="rounded-2xl border border-white/10 bg-[#111a2b]/70 p-5"><div className="mb-4 flex items-center gap-3"><Clock3 size={17} className="text-amber-200"/><div><h2 className="font-semibold">Convites pendentes</h2><p className="mt-1 text-xs text-slate-500">Aguardam aceitação pela pessoa convidada.</p></div></div>{invitations.length===0?<p className="text-sm text-slate-500">Não existem convites pendentes.</p>:<div className="grid gap-3 md:grid-cols-2">{invitations.map(inv=><div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.07] p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{inv.email}</p><p className="mt-1 text-[11px] text-slate-500">{roleLabels[inv.role]||inv.role} · Expira em {new Date(inv.expiresAt).toLocaleDateString("pt-PT")}</p></div><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-200">Pendente</span></div>)}</div>}</section>
  <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0"/> Os limites de membros dependem do plano. Os convites pendentes também ocupam uma vaga para impedir que a equipa ultrapasse o limite contratado.</p>
 </div>;
}
