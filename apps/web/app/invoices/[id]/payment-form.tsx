"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function InvoicePaymentForm({ id, currency, balance }: { id: string; currency: string; balance: number }) {
  const router=useRouter();
  const [amount,setAmount]=useState(balance.toFixed(2));
  const [method,setMethod]=useState("BANK_TRANSFER");
  const [reference,setReference]=useState("");
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{
    const response=await fetch(`/api/invoices/${id}/payments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:Number(amount),method,reference,notes})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível registar o recebimento.");
    router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Erro inesperado.");}finally{setBusy(false);}}
  return <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6"><h2 className="font-semibold">Registar recebimento</h2><p className="mt-1 text-xs text-slate-500">Regista apenas pagamentos efectivamente recebidos.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-xs text-slate-400">Valor recebido ({currency})<input required type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm"/></label>
    <label className="text-xs text-slate-400">Método<select value={method} onChange={e=>setMethod(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm"><option value="BANK_TRANSFER">Transferência bancária</option><option value="CASH">Dinheiro</option><option value="CARD">Cartão</option><option value="MOBILE_MONEY">Dinheiro móvel</option><option value="CHECK">Cheque</option><option value="OTHER">Outro</option></select></label>
    <label className="text-xs text-slate-400 sm:col-span-2">Referência (opcional)<input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm"/></label>
    <label className="text-xs text-slate-400 sm:col-span-2">Notas (opcional)<textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm"/></label>
  </div>{error&&<p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}<button disabled={busy||Number(amount)<=0||Number(amount)>balance} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy?"A registar…":"Registar pagamento"}</button></form>;
}
