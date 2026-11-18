"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

export default function AcceptTeamInvitationPage(){
 const router=useRouter();
 const [status,setStatus]=useState<"checking"|"accepted"|"error">("checking");
 const [message,setMessage]=useState("A validar o convite…");
 const [inviteToken,setInviteToken]=useState("");
 useEffect(()=>{
  let active=true;
  const currentToken=new URLSearchParams(window.location.search).get("token")||"";
  setInviteToken(currentToken);
  async function accept(){
   if(!currentToken){setStatus("error");setMessage("O link do convite não contém um código válido.");return;}
   try{
    const response=await fetch("/api/team/invitations/accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:currentToken})});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||"Não foi possível aceitar o convite.");
    if(active){setStatus("accepted");setMessage("O convite foi aceite. Já podes aceder ao espaço da empresa.");}
   }catch(error){if(active){setStatus("error");setMessage(error instanceof Error?error.message:"Falha ao validar convite.");}}
  }
  void accept();return()=>{active=false;};
 },[]);
 return <main className="grid min-h-screen place-items-center bg-[#080d18] px-5 text-white"><section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111a2b] p-8 text-center shadow-2xl shadow-black/30"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-400/10 text-indigo-200">{status==="checking"?<LoaderCircle className="animate-spin" size={25}/>:status==="accepted"?<CheckCircle2 size={26}/>:<ShieldCheck size={26}/>}</span><p className="mt-6 text-[10px] font-bold uppercase tracking-[.25em] text-indigo-300">InvoiceFlow · Convite de equipa</p><h1 className="mt-3 text-2xl font-semibold">{status==="accepted"?"Bem-vindo à equipa":status==="error"?"Não foi possível aceitar":"A validar convite"}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>{status==="error"&&<p className="mt-5 text-xs text-slate-500">Se ainda não iniciaste sessão, entra com o mesmo e-mail para o qual o convite foi enviado e abre novamente este link.</p>}<button onClick={()=>router.replace("/dashboard")} disabled={status==="checking"} className="mt-7 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3.5 text-sm font-bold disabled:opacity-40">{status==="accepted"?"Abrir espaço de trabalho":"Ir para o painel"}</button><div className="mt-5 flex flex-col gap-3"><Link href="/login" className="text-xs text-indigo-300 hover:text-white">Já tenho conta · Entrar</Link><Link href={`/register?plan=free&invite=${encodeURIComponent(inviteToken)}`} className="text-xs text-slate-400 hover:text-white">Ainda não tenho conta · Criar conta</Link></div></section></main>;
}
