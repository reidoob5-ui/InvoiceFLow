"use client";

import { FormEvent, useState } from "react";

const input = "mt-1.5 w-full rounded-xl border border-white/10 bg-[#080d18] px-3.5 py-3 text-sm text-white outline-none focus:border-indigo-400";

export default function NoticeForm({ token, balance, currency, defaultName, pending }: { token: string; balance: string; currency: string; defaultName: string; pending: number }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(pending > 0 ? { ok: true, text: "Já recebemos um aviso de pagamento. A empresa vai confirmá-lo." } : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await fetch(`/api/public/invoices/${token}/notice`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setState({ ok: true, text: "Aviso enviado. A empresa vai confirmar o pagamento." }); setOpen(false); }
      else setState({ ok: false, text: j.error ?? "Não foi possível enviar o aviso." });
    } finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
    <h2 className="font-semibold">Já pagou?</h2>
    <p className="mt-1 text-sm text-slate-400">Avise a empresa para ela confirmar o recebimento mais depressa.</p>
    {state && <p role="status" className={`mt-3 rounded-xl px-4 py-3 text-sm ${state.ok ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>{state.text}</p>}
    {!open ? <button onClick={() => setOpen(true)} className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950">Informar pagamento</button> :
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">O seu nome<input name="payerName" required maxLength={120} defaultValue={defaultName} className={input}/></label>
        <label className="text-xs text-slate-400">Valor pago ({currency})<input name="amount" required inputMode="decimal" defaultValue={balance} pattern="[0-9]+([.][0-9]{1,2})?" className={input}/></label>
        <label className="text-xs text-slate-400">Data do pagamento<input name="paidOn" type="date" className={input}/></label>
        <label className="text-xs text-slate-400">Referência / comprovativo nº<input name="reference" maxLength={120} className={input}/></label>
        <label className="text-xs text-slate-400 sm:col-span-2">Nota (opcional)<textarea name="note" maxLength={500} rows={2} className={input}/></label>
        <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{busy ? "A enviar…" : "Enviar aviso"}</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/15 px-5 py-3 text-sm">Cancelar</button></div>
      </form>}
  </section>;
}
