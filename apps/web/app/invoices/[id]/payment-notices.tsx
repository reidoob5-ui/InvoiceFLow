"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type NoticeRow = { id: string; payerName: string; amount: string; paidOn: string | null; reference: string | null; note: string | null };

export default function PaymentNotices({ notices, canAct, portalPath }: { notices: NoticeRow[]; canAct: boolean; portalPath: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(id: string, action: "confirm" | "reject") {
    setBusy(id); setErr(null);
    try {
      const res = await fetch(`/api/payment-notices/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "Erro.");
      else router.refresh();
    } finally { setBusy(null); }
  }
  async function copy() {
    if (!portalPath) return;
    try { await navigator.clipboard.writeText(`${location.origin}${portalPath}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão da área de transferência */ }
  }

  if (!notices.length && !portalPath) return null;
  return <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Portal do cliente</h2>
      {portalPath && <button onClick={copy} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium">{copied ? "Link copiado" : "Copiar link do portal"}</button>}
    </div>
    <p className="mt-1 text-xs text-slate-500">O cliente vê a factura, as instruções de pagamento e pode avisar que pagou.</p>
    {err && <p role="alert" className="mt-3 rounded-xl bg-rose-400/10 p-3 text-sm text-rose-200">{err}</p>}
    {notices.map((n) => <div key={n.id} className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/[.06] p-4 text-sm">
      <p className="font-medium">Aviso de pagamento: {n.amount} <span className="text-slate-400">de {n.payerName}</span></p>
      <p className="mt-1 text-xs text-slate-400">{n.paidOn ? `Pago em ${n.paidOn}` : "Sem data"}{n.reference ? ` · Ref.: ${n.reference}` : ""}</p>
      {n.note && <p className="mt-1 text-xs text-slate-400">{n.note}</p>}
      {canAct && <div className="mt-3 flex gap-2">
        <button disabled={busy === n.id} onClick={() => act(n.id, "confirm")} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">Confirmar recebimento</button>
        <button disabled={busy === n.id} onClick={() => act(n.id, "reject")} className="rounded-xl border border-white/15 px-4 py-2 text-xs">Rejeitar</button>
      </div>}
    </div>)}
  </section>;
}
