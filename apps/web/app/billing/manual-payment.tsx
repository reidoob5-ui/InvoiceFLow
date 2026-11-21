"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Check, Clock, Copy, MessageCircle, X } from "lucide-react";

type Payment = { id: string; reference: string; status: "OPEN" | "PAID" | "VOID"; amount: string; interval: string; plan: string; createdAt: string; claimedAt: string | null; paidAt: string | null; periodEnd: string | null; reviewNote: string | null; whatsapp: string | null };
type Data = { settings: { bank: string; holder: string; iban: string; bank2: string; iban2: string; express: string; note: string; whatsappConfigured: boolean }; plans: { key: string; name: string; monthly: number; yearly: number }[]; payments: Payment[] };

const kz = (v: number | string) => new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(Number(v));
const day = (v: string | null) => (v ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" }).format(new Date(v)) : "—");

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
    <div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="truncate font-mono text-sm text-white">{value}</p></div>
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* sem clipboard */ } }}
      aria-label={`Copiar ${label}`} className="rounded-lg p-2 text-slate-400 hover:bg-white/10">{done ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}</button>
  </div>;
}

export default function ManualPayment() {
  const [data, setData] = useState<Data | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [planKey, setPlanKey] = useState("");
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/billing/manual", { cache: "no-store" });
    if (res.status === 403) { setForbidden(true); return; }
    if (!res.ok) return;
    const d = (await res.json()) as Data;
    setData(d); setPlanKey((k) => k || d.plans[0]?.key || "");
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function call(url: string, init: RequestInit) {
    setBusy(true); setError("");
    try {
      const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Não foi possível concluir.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); }
    finally { setBusy(false); }
  }

  if (forbidden || !data) return null;
  const open = data.payments.find((p) => p.status === "OPEN");
  const history = data.payments.filter((p) => p.status !== "OPEN");
  const hasDetails = !!(data.settings.iban || data.settings.iban2 || data.settings.express);
  const chosen = data.plans.find((p) => p.key === planKey);

  return <section className="rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-500/10 to-white/[.02] p-5 sm:p-6">
    <div className="flex items-start gap-3"><Banknote size={20} className="mt-0.5 text-emerald-300" />
      <div><h2 className="text-lg font-semibold text-white">Pagar por transferência ou Multicaixa Express</h2>
        <p className="mt-1 text-xs text-slate-400">Pagas, envias o comprovativo por WhatsApp e o administrador confirma. O plano só fica activo depois dessa confirmação.</p></div></div>

    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}

    {!open && <div className="mt-5 space-y-3">
      {data.plans.length === 0 ? <p className="text-sm text-slate-400">Não há planos pagos disponíveis.</p> : <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Plano<select value={planKey} onChange={(e) => setPlanKey(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a30] px-3 py-3 text-sm text-white">{data.plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
          <label className="text-xs text-slate-400">Periodicidade<select value={interval} onChange={(e) => setInterval(e.target.value as "MONTHLY" | "YEARLY")} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111a30] px-3 py-3 text-sm text-white"><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select></label>
        </div>
        {chosen && <p className="text-sm font-semibold text-white">{kz(interval === "YEARLY" ? chosen.yearly : chosen.monthly)} <span className="text-xs font-normal text-slate-500">/ {interval === "YEARLY" ? "ano" : "mês"}</span></p>}
        <button type="button" disabled={busy || !planKey} onClick={() => call("/api/billing/manual", { method: "POST", body: JSON.stringify({ planKey, interval }) })} className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "A gerar…" : "Gerar referência de pagamento"}</button></>}
    </div>}

    {open && <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <div><p className="text-[10px] uppercase tracking-wider text-slate-500">Referência (escreve no pagamento e no WhatsApp)</p><p className="mt-1 font-mono text-xl font-bold text-white">{open.reference}</p></div>
        <div className="text-right"><p className="text-sm text-slate-300">{open.plan} · {open.interval === "YEARLY" ? "anual" : "mensal"}</p><p className="text-lg font-semibold text-white">{kz(open.amount)}</p></div>
      </div>
      {hasDetails ? <div className="grid gap-2 sm:grid-cols-2">
        <CopyRow label={data.settings.bank ? `IBAN / NIB — ${data.settings.bank}` : "IBAN / NIB"} value={data.settings.iban} />
        <CopyRow label={data.settings.bank2 ? `IBAN / NIB — ${data.settings.bank2}` : "IBAN / NIB (2.ª conta)"} value={data.settings.iban2} />
        <CopyRow label="Titular" value={data.settings.holder} />
        <CopyRow label="Multicaixa Express" value={data.settings.express} />
        <CopyRow label="Valor" value={kz(open.amount)} />
      </div> : <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs text-amber-200">Os dados de pagamento ainda não foram configurados. Contacta o administrador.</p>}
      {data.settings.note && <p className="text-xs text-slate-400">{data.settings.note}</p>}

      {!open.claimedAt ? <div className="space-y-3 rounded-xl border border-white/10 bg-white/[.03] p-4">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-300"><li>Faz o pagamento com a referência <strong>{open.reference}</strong>.</li><li>Envia o comprovativo por WhatsApp ao administrador.</li><li>Carrega em “Já enviei o comprovativo”.</li></ol>
        <div className="flex flex-wrap gap-2">
          {open.whatsapp ? <a href={open.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950"><MessageCircle size={16} /> Enviar comprovativo no WhatsApp</a>
            : <span className="text-xs text-amber-200">WhatsApp do administrador ainda não configurado.</span>}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Nota opcional (ex.: banco usado, hora da transferência)" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600" />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => call(`/api/billing/manual/${open.id}`, { method: "POST", body: JSON.stringify({ note }) })} className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">Já enviei o comprovativo</button>
          <button type="button" disabled={busy} onClick={() => call(`/api/billing/manual/${open.id}`, { method: "DELETE" })} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 disabled:opacity-50">Cancelar pedido</button>
        </div>
      </div> : <div className="flex items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-400/10 p-4"><Clock size={18} className="mt-0.5 text-amber-300" />
        <div><p className="text-sm font-semibold text-amber-100">A aguardar confirmação do administrador</p><p className="mt-1 text-xs text-amber-100/80">Enviado em {day(open.claimedAt)}. O plano é activado assim que o pagamento for confirmado. Se ainda não enviaste o comprovativo, envia-o por WhatsApp.</p>
          {open.whatsapp && <a href={open.whatsapp} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 underline"><MessageCircle size={13} /> Abrir WhatsApp</a>}</div></div>}
    </div>}

    {history.length > 0 && <div className="mt-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Histórico</p>
      <div className="mt-2 divide-y divide-white/[.06] rounded-xl border border-white/10">{history.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
        <div><span className="font-mono text-slate-300">{p.reference}</span> <span className="text-slate-500">· {p.plan} · {kz(p.amount)}</span>{p.reviewNote && <p className="mt-0.5 text-rose-300">{p.reviewNote}</p>}</div>
        {p.status === "PAID" ? <span className="inline-flex items-center gap-1 text-emerald-300"><Check size={13} /> Confirmado até {day(p.periodEnd)}</span> : <span className="inline-flex items-center gap-1 text-slate-500"><X size={13} /> Não confirmado</span>}
      </div>)}</div></div>}
  </section>;
}
