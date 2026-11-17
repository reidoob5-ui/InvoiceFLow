"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Line = { productId: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRateId: string };
type Client = { id: string; name: string; currency: string | null };
type Product = { id: string; name: string; unitPrice: string | number; currency: string; taxRateId?: string | null };
type Tax = { id: string; name: string; rate: string | number; active: boolean };
type InvoiceData = { id: string; clientId: string; currency: string; paymentTermsDays: number; withholdingRate: number; notes: string; terms: string; lines: Line[] };
const blank = (): Line => ({ productId: "", description: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxRateId: "" });

export default function EditInvoiceForm({ invoice }: { invoice: InvoiceData }) {
  const router = useRouter();
  const [clients,setClients]=useState<Client[]>([]),[products,setProducts]=useState<Product[]>([]),[taxes,setTaxes]=useState<Tax[]>([]);
  const [clientId,setClientId]=useState(invoice.clientId),[currency,setCurrency]=useState(invoice.currency);
  const [termsDays,setTermsDays]=useState(String(invoice.paymentTermsDays)),[withholding,setWithholding]=useState(String(invoice.withholdingRate));
  const [lines,setLines]=useState<Line[]>(invoice.lines.length?invoice.lines:[blank()]);
  const [notes,setNotes]=useState(invoice.notes),[terms,setTerms]=useState(invoice.terms);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
  useEffect(()=>{(async()=>{try{
    const [c,p,t]=await Promise.all([fetch("/api/clients"),fetch("/api/products"),fetch("/api/taxes")]);
    const [cd,pd,td]=await Promise.all([c.json(),p.json(),t.json()]);
    if(!c.ok||!p.ok||!t.ok)throw new Error(cd.error||pd.error||td.error||"Não foi possível carregar os dados.");
    setClients(cd.clients);setProducts(pd.products);setTaxes(td.taxes.filter((x:Tax)=>x.active));
  }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar dados.");}finally{setLoading(false);}})();},[]);
  const totals=useMemo(()=>{let subtotal=0,discount=0,tax=0;for(const l of lines){const gross=(Number(l.quantity)||0)*(Number(l.unitPrice)||0),d=gross*(Number(l.discountPercent)||0)/100,net=gross-d;subtotal+=net;discount+=d;tax+=net*(Number(taxes.find(t=>t.id===l.taxRateId)?.rate)||0)/100;}const withholdingTotal=subtotal*(Number(withholding)||0)/100;return {subtotal,discount,tax,withholdingTotal,total:subtotal+tax-withholdingTotal};},[lines,taxes,withholding]);
  const money=(v:number)=>new Intl.NumberFormat("pt-PT",{style:"currency",currency:/^[A-Z]{3}$/.test(currency)?currency:"USD"}).format(v);
  function patch(i:number,p:Partial<Line>){setLines(old=>old.map((l,n)=>n===i?{...l,...p}:l));}
  function chooseProduct(i:number,id:string){const p=products.find(x=>x.id===id);patch(i,p?{productId:id,description:p.name,unitPrice:String(p.unitPrice),taxRateId:p.taxRateId??""}:{productId:""});}
  async function save(e:FormEvent){e.preventDefault();setSaving(true);setError("");try{
    const r=await fetch(`/api/invoices/${invoice.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId,currency,paymentTermsDays:Number(termsDays),withholdingRate:Number(withholding),notes,terms,lines:lines.map(l=>({...l,quantity:Number(l.quantity),unitPrice:Number(l.unitPrice),discountPercent:Number(l.discountPercent)}))})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"Não foi possível actualizar o rascunho.");
    router.push(`/invoices/${invoice.id}`);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Erro inesperado.");}finally{setSaving(false);}}
  if(loading)return <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-slate-400">A carregar dados…</div>;
  return <form onSubmit={save} className="grid gap-6 lg:grid-cols-[1fr_300px]">
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"><h2 className="mb-4 font-semibold">Cliente e condições</h2><div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-300">Cliente<select required value={clientId} onChange={e=>setClientId(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3">{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="text-sm text-slate-300">Moeda<input required minLength={3} maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3"/></label>
        <label className="text-sm text-slate-300">Prazo (dias)<input type="number" min="0" max="365" value={termsDays} onChange={e=>setTermsDays(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3"/></label>
        <label className="text-sm text-slate-300">Retenção (%)<input type="number" min="0" max="100" step="0.001" value={withholding} onChange={e=>setWithholding(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3"/></label>
      </div></section>
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"><div className="mb-4 flex justify-between"><h2 className="font-semibold">Linhas da factura</h2><button type="button" onClick={()=>setLines(x=>[...x,blank()])} className="text-sm text-indigo-300">+ Adicionar</button></div>
        <div className="space-y-4">{lines.map((l,i)=><div key={i} className="rounded-xl border border-white/10 bg-slate-950/50 p-4"><div className="mb-3 flex justify-between text-xs text-slate-400"><span>LINHA {i+1}</span>{lines.length>1&&<button type="button" onClick={()=>setLines(x=>x.filter((_,n)=>n!==i))} className="text-rose-300">Remover</button>}</div>
          <label className="block text-xs text-slate-400">Produto (opcional)<select value={l.productId} onChange={e=>chooseProduct(i,e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm"><option value="">Personalizado</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.currency}</option>)}</select></label>
          <label className="mt-3 block text-xs text-slate-400">Descrição<input required minLength={2} maxLength={500} value={l.description} onChange={e=>patch(i,{description:e.target.value,productId:""})} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm"/></label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Quantidade<input type="number" required min="0.001" step="0.001" value={l.quantity} onChange={e=>patch(i,{quantity:e.target.value})} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm"/></label><label className="text-xs text-slate-400">Preço unitário<input type="number" required min="0" step="0.01" disabled={!!l.productId} value={l.unitPrice} onChange={e=>patch(i,{unitPrice:e.target.value})} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm"/></label><label className="text-xs text-slate-400">Desconto (%)<input type="number" min="0" max="100" step="0.001" value={l.discountPercent} onChange={e=>patch(i,{discountPercent:e.target.value})} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm"/></label><label className="text-xs text-slate-400">Imposto<select value={l.taxRateId} onChange={e=>patch(i,{taxRateId:e.target.value})} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 p-2.5 text-sm"><option value="">Sem imposto</option>{taxes.map(t=><option key={t.id} value={t.id}>{t.name} · {Number(t.rate)}%</option>)}</select></label></div>
        </div>)}</div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"><h2 className="mb-4 font-semibold">Notas e condições</h2><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Notas<textarea rows={3} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3"/></label><label className="text-sm text-slate-300">Termos<textarea rows={3} maxLength={4000} value={terms} onChange={e=>setTerms(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3"/></label></div></section>
    </div>
    <aside className="h-fit rounded-2xl border border-white/10 bg-slate-900/70 p-5"><h2 className="font-semibold">Resumo</h2><div className="mt-4 space-y-3 text-sm">{[["Subtotal",totals.subtotal],["Descontos",-totals.discount],["Impostos",totals.tax],["Retenção",-totals.withholdingTotal]].map(([label,value])=><div key={String(label)} className="flex justify-between text-slate-400"><span>{label}</span><span>{money(Number(value))}</span></div>)}<div className="flex justify-between border-t border-white/10 pt-4 text-base font-semibold"><span>Total</span><span>{money(totals.total)}</span></div></div>
      {error&&<p role="alert" className="mt-4 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
      <button disabled={saving||!clientId||!lines.length} className="mt-6 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving?"A guardar…":"Guardar alterações"}</button><Link href={`/invoices/${invoice.id}`} className="mt-3 block text-center text-xs text-slate-500">Cancelar</Link>
    </aside>
  </form>;
}
