"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Quote = { id: string; number: string | null; title: string | null; status: string; currency: string; total: string; issueDate: string | null; validUntil: string | null; createdAt: string; client: { name: string } };
type Client = { id: string; name: string };
type Tax = { id: string; name: string; rate: string };
const labels: Record<string,string> = { DRAFT:"Rascunho", SENT:"Enviado", ACCEPTED:"Aceite", REJECTED:"Rejeitado", EXPIRED:"Expirado", CONVERTED:"Convertido" };

export default function QuotesPage() {
  const [quotes,setQuotes] = useState<Quote[]>([]);
  const [clients,setClients] = useState<Client[]>([]);
  const [taxes,setTaxes] = useState<Tax[]>([]);
  const [show,setShow] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [form,setForm] = useState({ clientId:"", title:"", currency:"AOA", validUntil:"", notes:"", description:"", quantity:"1", unitPrice:"", taxRateId:"", discountPercent:"0" });
  const load = useCallback(async () => {
    const [qr,cr,tr] = await Promise.all([fetch("/api/quotes"),fetch("/api/clients"),fetch("/api/taxes")]);
    const qd = await qr.json(), cd = await cr.json(), td = await tr.json();
    if (qr.ok) setQuotes(qd.quotes ?? []); else setError(qd.error ?? "Falha ao carregar orçamentos.");
    if (cr.ok) setClients(cd.clients ?? []);
    if (tr.ok) setTaxes((td.taxes ?? []).filter((tax: Tax) => tax.id));
  },[]);
  useEffect(()=>{ void load(); },[load]);

  async function create(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/quotes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        clientId:form.clientId,title:form.title,currency:form.currency,validUntil:form.validUntil || null,notes:form.notes,
        lines:[{description:form.description,quantity:form.quantity,unitPrice:form.unitPrice,taxRateId:form.taxRateId,discountPercent:form.discountPercent}],
      })});
      const data = await response.json();
      if(!response.ok) throw new Error(data.error || "Não foi possível criar o orçamento.");
      setShow(false); setForm({clientId:"",title:"",currency:"AOA",validUntil:"",notes:"",description:"",quantity:"1",unitPrice:"",taxRateId:"",discountPercent:"0"});
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro inesperado."); }
    finally { setBusy(false); }
  }

  async function changeStatus(id:string,status:string) {
    setError("");
    const response=await fetch("/api/quotes/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
    const data=await response.json(); if(!response.ok){setError(data.error);return;} await load();
  }
  async function convert(id:string) {
    setError("");
    const response=await fetch("/api/quotes/"+id+"/convert",{method:"POST"});
    const data=await response.json();
    if(!response.ok){setError(data.error);return;}
    window.location.href="/invoices/"+data.invoice.id;
  }
  const money=(amount:string,currency:string)=>{try{return new Intl.NumberFormat("pt-AO",{style:"currency",currency}).format(Number(amount));}catch{return amount+" "+currency;}};

  return <main className="min-h-screen px-5 py-7 sm:px-8"><div className="mx-auto max-w-7xl">
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><Link href="/dashboard" className="text-sm text-indigo-300">← Dashboard</Link><h1 className="mt-2 text-3xl font-semibold">Orçamentos</h1><p className="mt-1 text-sm text-slate-400">Cria propostas comerciais e converte as propostas aceites em facturas.</p></div><button onClick={()=>setShow(true)} className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold hover:bg-indigo-400">+ Novo orçamento</button></header>
    {error&&<p role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/[.03] text-xs text-slate-500"><tr><th className="px-5 py-4">Orçamento</th><th className="px-5 py-4">Cliente</th><th className="px-5 py-4">Validade</th><th className="px-5 py-4">Total</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4 text-right">Acções</th></tr></thead><tbody>{quotes.map(q=><tr key={q.id} className="border-t border-white/[.06]"><td className="px-5 py-4"><div className="font-medium">{q.number||"Rascunho"}</div><div className="text-xs text-slate-500">{q.title||"Proposta comercial"}</div></td><td className="px-5 py-4 text-slate-300">{q.client.name}</td><td className="px-5 py-4 text-slate-400">{q.validUntil?new Intl.DateTimeFormat("pt-PT").format(new Date(q.validUntil)):"—"}</td><td className="px-5 py-4 font-medium">{money(q.total,q.currency)}</td><td className="px-5 py-4"><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs">{labels[q.status]||q.status}</span></td><td className="px-5 py-4 text-right">{q.status==="DRAFT"&&<button onClick={()=>void changeStatus(q.id,"SENT")} className="mr-3 text-indigo-300">Marcar enviado</button>}{q.status==="SENT"&&<><button onClick={()=>void changeStatus(q.id,"ACCEPTED")} className="mr-3 text-emerald-300">Aceite</button><button onClick={()=>void changeStatus(q.id,"REJECTED")} className="mr-3 text-rose-300">Rejeitado</button></>}{q.status==="ACCEPTED"&&<button onClick={()=>void convert(q.id)} className="text-indigo-300">Converter em factura</button>}</td></tr>)}</tbody></table></div>{quotes.length===0&&<div className="p-12 text-center text-sm text-slate-500">Ainda não existem orçamentos. Cria o primeiro para começar.</div>}</div>
    {show&&<div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/70 p-4"><form onSubmit={create} className="my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Novo orçamento</h2><button type="button" onClick={()=>setShow(false)} className="text-slate-400">Fechar ✕</button></div><div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-slate-300 sm:col-span-2">Cliente *<select required value={form.clientId} onChange={e=>setForm(f=>({...f,clientId:e.target.value}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"><option value="">Selecciona um cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-sm text-slate-300">Título<input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label>
      <label className="text-sm text-slate-300">Moeda<input required maxLength={3} value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value.toUpperCase()}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label>
      <label className="text-sm text-slate-300">Válido até<input type="date" value={form.validUntil} onChange={e=>setForm(f=>({...f,validUntil:e.target.value}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label>
      <div className="sm:col-span-2 rounded-xl border border-white/10 p-4"><h3 className="mb-3 font-medium">Primeira linha</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-300 sm:col-span-2">Descrição *<input required value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label>{([["quantity","Quantidade"],["unitPrice","Preço unitário"],["discountPercent","Desconto %"]] as const).map(([key,label])=><label key={key} className="text-sm text-slate-300">{label}<input required type="number" min="0" step="0.01" value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label>)}</div><label className="mt-3 block text-sm text-slate-300">Taxa de imposto<select value={form.taxRateId} onChange={e=>setForm(f=>({...f,taxRateId:e.target.value}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"><option value="">Sem imposto</option>{taxes.map(t=><option key={t.id} value={t.id}>{t.name} ({Number(t.rate)}%)</option>)}</select></label></div>
      <label className="text-sm text-slate-300 sm:col-span-2">Notas<textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label></div><button disabled={busy} className="mt-5 w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-50">{busy?"A guardar…":"Guardar orçamento"}</button></form></div>}
  </div></main>;
}
