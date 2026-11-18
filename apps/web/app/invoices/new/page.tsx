"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Client = { id: string; name: string; currency: string | null };
type Product = { id: string; name: string; unitPrice: string | number; currency: string; taxRate: string | number };
type Tax = { id: string; name: string; rate: string | number };
type Line = { productId: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRateId: string };
const blankLine = (): Line => ({ productId: "", description: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxRateId: "" });

export default function NewInvoicePage() {
  const [clients,setClients]=useState<Client[]>([]),[products,setProducts]=useState<Product[]>([]),[taxes,setTaxes]=useState<Tax[]>([]);
  const [clientId,setClientId]=useState(""),[currency,setCurrency]=useState("USD"),[paymentTermsDays,setPaymentTermsDays]=useState("30"),[withholdingRate,setWithholdingRate]=useState("0");
  const [lines,setLines]=useState<Line[]>([blankLine()]),[notes,setNotes]=useState(""),[terms,setTerms]=useState("");
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");

  useEffect(()=>{(async()=>{try{
    const [c,p,t,o]=await Promise.all([fetch("/api/clients"),fetch("/api/products"),fetch("/api/taxes"),fetch("/api/organizations/settings")]);
    const [cd,pd,td,od]=await Promise.all([c.json(),p.json(),t.json(),o.json()]);
    if(!c.ok)throw new Error(cd.error||"Não foi possível carregar clientes.");
    if(!p.ok)throw new Error(pd.error||"Não foi possível carregar produtos.");
    if(!t.ok)throw new Error(td.error||"Não foi possível carregar impostos.");\n    if(!o.ok)throw new Error(od.error||"Não foi possível carregar as definições da empresa.");
    setClients(cd.clients);setProducts(pd.products);setTaxes(td.taxes.filter((x:Tax & {active?:boolean})=>x.active));\n    setCurrency(od.organization.currency || "USD");\n    setPaymentTermsDays(String(od.organization.defaultPaymentTerms ?? 30));\n    setNotes(od.organization.invoiceNotes || "");\n    setTerms(od.organization.invoiceTerms || "");
    const first=cd.clients[0];if(first){setClientId(first.id);if(first.currency)setCurrency(first.currency);}
    const defaultTax=td.taxes.find((x:Tax & {isDefault?:boolean;active?:boolean})=>x.isDefault&&x.active);
    if(defaultTax)setLines([ {...blankLine(),taxRateId:defaultTax.id} ]);
  }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar dados.");}finally{setLoading(false);}})();},[]);
  const totals=useMemo(()=>{
    let subtotal=0,discount=0,tax=0;
    for(const line of lines){const gross=Math.max(0,Number(line.quantity)||0)*Math.max(0,Number(line.unitPrice)||0);const d=gross*Math.min(100,Math.max(0,Number(line.discountPercent)||0))/100;const net=Math.round((gross-d+Number.EPSILON)*100)/100;const rate=Number(taxes.find(t=>t.id===line.taxRateId)?.rate)||0;subtotal+=net;discount+=Math.round(d*100)/100;tax+=Math.round(net*rate)/100;}
    const withholding=Math.round(subtotal*Math.min(100,Math.max(0,Number(withholdingRate)||0)))/100;
    return {subtotal,discount,tax,withholding,total:subtotal+tax-withholding};
  },[lines,taxes,withholdingRate]);
  const money=(v:number)=>new Intl.NumberFormat("pt-PT",{style:"currency",currency:/^[A-Z]{3}$/.test(currency)?currency:"USD"}).format(v);
  function changeLine(index:number,patch:Partial<Line>){setLines(old=>old.map((line,i)=>i===index?{...line,...patch}:line));}
  function chooseProduct(index:number,id:string){const product=products.find(p=>p.id===id);changeLine(index,product?{productId:id,description:product.name,unitPrice:String(product.unitPrice)}:{productId:""});}
  async function save(event:FormEvent){event.preventDefault();setSaving(true);setError("");try{
    const response=await fetch("/api/invoices",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId,currency,paymentTermsDays:Number(paymentTermsDays),withholdingRate:Number(withholdingRate),notes,terms,lines:lines.map(l=>({...l,quantity:Number(l.quantity),unitPrice:Number(l.unitPrice),discountPercent:Number(l.discountPercent)}))})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível guardar a factura.");
    window.location.href=`/invoices/${data.invoice.id}`;
  }catch(e){setError(e instanceof Error?e.message:"Erro inesperado.");}finally{setSaving(false);}}
  return <main className="min-h-screen px-5 py-8 sm:px-8"><div className="mx-auto max-w-6xl">
    <Link href="/invoices" className="text-sm text-indigo-300">← Facturas</Link><header className="my-6"><h1 className="text-3xl font-semibold">Nova factura</h1><p className="mt-2 text-sm text-slate-400">Prepara um rascunho. A numeração oficial é atribuída apenas quando emitires.</p></header>
    {loading?<div className="rounded-2xl border border-white/10 bg-slate-900/60 p-10 text-slate-400">A carregar clientes, produtos e impostos…</div>:<form onSubmit={save} className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6"><h2 className="mb-4 font-semibold">Dados do cliente</h2><div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Cliente *<select required value={clientId} onChange={e=>{setClientId(e.target.value);const c=clients.find(x=>x.id===e.target.value);if(c?.currency)setCurrency(c.currency);}} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"><option value="">Seleccionar cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm text-slate-300">Moeda<select value={currency} onChange={e=>setCurrency(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3">{[...new Set(["USD","AOA","EUR","GBP","ZAR","BRL",currency])].map(c=><option key={c} value={c}>{c}</option>)}</select></label>
          <label className="text-sm text-slate-300">Prazo de pagamento (dias)<input type="number" min="0" max="365" value={paymentTermsDays} onChange={e=>setPaymentTermsDays(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label>
          <label className="text-sm text-slate-300">Retenção na fonte (%)<input type="number" min="0" max="100" step="0.001" value={withholdingRate} onChange={e=>setWithholdingRate(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label>
        </div></section>
        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Produtos e serviços</h2><p className="mt-1 text-xs text-slate-500">Os preços dos produtos são confirmados no servidor.</p></div><button type="button" onClick={()=>setLines(old=>[...old,blankLine()])} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-indigo-300">+ Adicionar linha</button></div>
          <div className="space-y-4">{lines.map((line,index)=><div key={index} className="rounded-xl border border-white/10 bg-slate-950/50 p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">LINHA {index+1}</span>{lines.length>1&&<button type="button" onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))} className="text-xs text-rose-300">Remover</button>}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400 sm:col-span-2">Produto do catálogo (opcional)<select value={line.productId} onChange={e=>chooseProduct(index,e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm"><option value="">Linha personalizada</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.currency} {Number(p.unitPrice).toFixed(2)}</option>)}</select></label>
            <label className="text-xs text-slate-400 sm:col-span-2">Descrição<input required minLength={2} maxLength={500} value={line.description} onChange={e=>changeLine(index,{description:e.target.value,productId:""})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm"/></label>
            <label className="text-xs text-slate-400">Quantidade<input type="number" required min="0.001" step="0.001" value={line.quantity} onChange={e=>changeLine(index,{quantity:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm"/></label>
            <label className="text-xs text-slate-400">Preço unitário<input type="number" required min="0" step="0.01" disabled={!!line.productId} value={line.unitPrice} onChange={e=>changeLine(index,{unitPrice:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm disabled:opacity-60"/></label>
            <label className="text-xs text-slate-400">Desconto (%)<input type="number" min="0" max="100" step="0.001" value={line.discountPercent} onChange={e=>changeLine(index,{discountPercent:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm"/></label>
            <label className="text-xs text-slate-400">Imposto<select value={line.taxRateId} onChange={e=>changeLine(index,{taxRateId:e.target.value})} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm"><option value="">Sem imposto (0%)</option>{taxes.map(t=><option key={t.id} value={t.id}>{t.name} · {Number(t.rate)}%</option>)}</select></label></div>
          </div>)}</div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6"><h2 className="mb-4 font-semibold">Informações adicionais</h2><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Notas<textarea rows={3} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label><label className="text-sm text-slate-300">Termos e condições<textarea rows={3} maxLength={4000} value={terms} onChange={e=>setTerms(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"/></label></div></section>
      </div>
      <aside className="h-fit rounded-2xl border border-white/10 bg-slate-900/70 p-5 xl:sticky xl:top-6"><h2 className="font-semibold">Resumo da factura</h2><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="flex justify-between text-slate-400"><span>Descontos</span><span>- {money(totals.discount)}</span></div><div className="flex justify-between text-slate-400"><span>Impostos</span><span>{money(totals.tax)}</span></div><div className="flex justify-between text-slate-400"><span>Retenção</span><span>- {money(totals.withholding)}</span></div><div className="border-t border-white/10 pt-4"><div className="flex justify-between text-base font-semibold"><span>Total</span><span>{money(totals.total)}</span></div></div></div>
        {error&&<p role="alert" className="mt-4 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
        <button disabled={saving||!clientId||lines.length===0} className="mt-6 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving?"A guardar…":"Guardar rascunho"}</button><Link href="/invoices" className="mt-3 block text-center text-xs text-slate-500">Cancelar</Link><p className="mt-4 text-[11px] leading-5 text-slate-500">O cálculo final é refeito no servidor. A factura só recebe número oficial quando for emitida.</p>
      </aside>
    </form>}
  </div></main>;
}
