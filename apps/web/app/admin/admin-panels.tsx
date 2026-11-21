"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Search, X } from "lucide-react";

export type PendingRow = { id: string; reference: string; org: string; owner: string; ownerEmail: string; phone: string; plan: string; interval: string; amount: string; createdAt: string; claimedAt: string | null; note: string | null; whatsapp: string | null };
export type HistoryRow = { id: string; reference: string; org: string; plan: string; amount: string; status: "PAID" | "VOID"; at: string; periodEnd: string | null; note: string | null };
export type SubRow = { orgId: string; org: string; owner: string; ownerEmail: string; phone: string; plan: string; planKey: string; state: string; periodEnd: string | null; trialEndsAt: string | null; lastPaidAt: string | null; pending: boolean; createdAt: string };
export type Settings = Record<"pay_bank" | "pay_holder" | "pay_iban" | "pay_express" | "admin_whatsapp" | "pay_note", string>;

const kz = (v: number | string) => new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(Number(v));
const dt = (v: string | null, time = false) => (v ? new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", ...(time ? { timeStyle: "short" } : {}) }).format(new Date(v)) : "—");
const daysLeft = (v: string | null) => (v ? Math.ceil((new Date(v).getTime() - Date.now()) / 86400_000) : null);

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function run(key: string, url: string, method: string, body: unknown) {
    setBusy(key); setError("");
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falhou.");
      router.refresh();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); return false; }
    finally { setBusy(""); }
  }
  return { run, busy, error, setError };
}

export function PaymentQueue({ rows }: { rows: PendingRow[] }) {
  const { run, busy, error } = useAction();
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [end, setEnd] = useState<Record<string, string>>({});
  if (rows.length === 0) return <p className="rounded-2xl border border-white/10 bg-white/[.025] p-8 text-center text-sm text-slate-500">Nenhum pagamento à espera de confirmação.</p>;
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
    {rows.map((r) => <article key={r.id} className={`rounded-2xl border p-5 ${r.claimedAt ? "border-amber-300/30 bg-amber-400/[.06]" : "border-white/10 bg-white/[.025]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-white">{r.org}</p><p className="mt-0.5 text-xs text-slate-400">{r.owner} · {r.ownerEmail}{r.phone ? ` · ${r.phone}` : ""}</p></div>
        <div className="text-right"><p className="text-lg font-semibold text-white">{kz(r.amount)}</p><p className="text-xs text-slate-400">{r.plan} · {r.interval === "YEARLY" ? "anual" : "mensal"}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-lg bg-black/30 px-2.5 py-1 font-mono text-sm text-white">{r.reference}</span>
        {r.claimedAt ? <span className="rounded-full bg-amber-400/20 px-2.5 py-1 font-medium text-amber-200">Cliente diz que pagou · {dt(r.claimedAt, true)}</span> : <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-400">Cliente ainda não avisou que pagou · pedido {dt(r.createdAt)}</span>}
        {r.whatsapp && <a href={r.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300 underline"><MessageCircle size={13} /> Falar com o cliente</a>}
      </div>
      {r.note && <p className="mt-2 text-xs text-slate-300">Nota do cliente: “{r.note}”</p>}
      <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
        <label className="text-[11px] text-slate-400">Nota interna (opcional)<input value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} maxLength={300} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
        <label className="text-[11px] text-slate-400">Fim do período (opcional; por defeito +{r.interval === "YEARLY" ? "1 ano" : "1 mês"})<input type="date" value={end[r.id] ?? ""} onChange={(e) => setEnd({ ...end, [r.id]: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!seen[r.id]} onChange={(e) => setSeen({ ...seen, [r.id]: e.target.checked })} className="mt-0.5" /> Vi o comprovativo no WhatsApp e confirmo que o valor ({kz(r.amount)}) e a referência ({r.reference}) estão certos.</label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!seen[r.id] || !!busy} onClick={() => run("c" + r.id, `/api/admin/billing/payments/${r.id}`, "POST", { action: "confirm", note: note[r.id], periodEnd: end[r.id] ? new Date(end[r.id] + "T23:59:59Z").toISOString() : undefined })} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40"><Check size={15} /> {busy === "c" + r.id ? "A confirmar…" : "Confirmar e activar plano"}</button>
        <button disabled={!!busy} onClick={() => { const reason = window.prompt("Motivo da rejeição (o cliente vai ver):", note[r.id] ?? ""); if (reason && reason.trim().length >= 3) run("r" + r.id, `/api/admin/billing/payments/${r.id}`, "POST", { action: "reject", note: reason }); }} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/30 px-4 py-2.5 text-sm text-rose-200 disabled:opacity-40"><X size={15} /> Rejeitar</button>
      </div>
    </article>)}
  </div>;
}

const STATE: Record<string, { label: string; cls: string }> = {
  PAID: { label: "Pago", cls: "bg-emerald-400/15 text-emerald-300" }, EXPIRING: { label: "A expirar", cls: "bg-amber-400/15 text-amber-300" },
  UNPAID: { label: "Não pago / expirado", cls: "bg-rose-400/15 text-rose-300" }, TRIAL: { label: "Experimental", cls: "bg-sky-400/15 text-sky-300" },
  FREE: { label: "Gratuito", cls: "bg-white/10 text-slate-300" }, NO_PLAN: { label: "Sem plano", cls: "bg-white/10 text-slate-400" },
  SUSPENDED: { label: "Suspenso", cls: "bg-rose-400/15 text-rose-300" }, GRACE: { label: "Em tolerância", cls: "bg-amber-400/15 text-amber-300" }, CANCELING: { label: "A cancelar", cls: "bg-amber-400/15 text-amber-300" },
};
const FILTERS: [string, string, (r: SubRow) => boolean][] = [
  ["all", "Todas", () => true], ["paid", "Pagas", (r) => r.state === "PAID" || r.state === "EXPIRING"], ["unpaid", "Não pagaram", (r) => r.state === "UNPAID" || r.state === "SUSPENDED" || r.state === "GRACE"],
  ["expiring", "A expirar (7 dias)", (r) => r.state === "EXPIRING"], ["trial", "Experimental", (r) => r.state === "TRIAL"], ["pending", "Com pagamento por confirmar", (r) => r.pending],
];

export function SubscriptionsTable({ rows, plans }: { rows: SubRow[]; plans: { key: string; name: string }[] }) {
  const { run, busy, error } = useAction();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all"); const [open, setOpen] = useState<string | null>(null);
  const [days, setDays] = useState("30"); const [planKey, setPlanKey] = useState(plans[0]?.key ?? "");
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x[0] === filter)![2]; const t = q.trim().toLowerCase();
    return rows.filter(f).filter((r) => !t || `${r.org} ${r.owner} ${r.ownerEmail}`.toLowerCase().includes(t));
  }, [rows, q, filter]);
  const count = (id: string) => rows.filter(FILTERS.find((x) => x[0] === id)![2]).length;
  const act = (orgId: string, body: Record<string, unknown>, confirm?: string) => { if (confirm && !window.confirm(confirm)) return; run(orgId + JSON.stringify(body), `/api/admin/billing/subscriptions/${orgId}`, "POST", body); };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === id ? "border-indigo-300/40 bg-indigo-500/20 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>{label} <span className="text-slate-500">{count(id)}</span></button>)}
      <label className="relative ml-auto"><Search size={14} className="absolute left-3 top-2.5 text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar empresa ou email" className="w-64 rounded-xl border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600" /></label>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[860px] text-left text-xs">
      <thead className="bg-white/[.03] text-slate-500"><tr><th className="p-3 font-medium">Empresa</th><th className="p-3 font-medium">Plano</th><th className="p-3 font-medium">Estado</th><th className="p-3 font-medium">Válido até</th><th className="p-3 font-medium">Último pagamento</th><th className="p-3" /></tr></thead>
      <tbody>{shown.map((r) => { const st = STATE[r.state] ?? STATE.NO_PLAN; const end = r.state === "TRIAL" ? r.trialEndsAt : r.periodEnd; const left = daysLeft(end);
        return <Fragment key={r.orgId}>
          <tr className="border-t border-white/[.06]">
            <td className="p-3"><p className="font-medium text-slate-100">{r.org}</p><p className="text-slate-500">{r.owner} · {r.ownerEmail}</p></td>
            <td className="p-3 text-slate-300">{r.plan}</td>
            <td className="p-3"><span className={`rounded-full px-2.5 py-1 font-medium ${st.cls}`}>{st.label}</span>{r.pending && <span className="ml-1.5 rounded-full bg-amber-400/20 px-2 py-1 text-amber-200">por confirmar</span>}</td>
            <td className="p-3 text-slate-300">{dt(end)}{left !== null && <span className={`ml-1.5 ${left < 0 ? "text-rose-300" : left <= 7 ? "text-amber-300" : "text-slate-500"}`}>({left < 0 ? `há ${-left} d` : `${left} d`})</span>}</td>
            <td className="p-3 text-slate-400">{dt(r.lastPaidAt)}</td>
            <td className="p-3 text-right"><button onClick={() => setOpen(open === r.orgId ? null : r.orgId)} className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/10">Gerir</button></td>
          </tr>
          {open === r.orgId && <tr className="bg-white/[.02]"><td colSpan={6} className="p-4"><div className="flex flex-wrap items-end gap-4">
            <div className="flex items-end gap-2"><label className="text-[11px] text-slate-400">Dias<input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className="mt-1 block w-20 rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-sm text-white" /></label>
              <button disabled={!!busy} onClick={() => act(r.orgId, { action: "extend", days: Number(days) }, `Dar mais ${days} dias a ${r.org}? Fica activo e sem pagamento registado.`)} className="rounded-lg bg-white/10 px-3 py-2 text-slate-100 hover:bg-white/20">Estender</button>
              <button disabled={!!busy} onClick={() => act(r.orgId, { action: "reactivate", days: Number(days) }, `Reactivar ${r.org} por ${days} dias a partir de hoje?`)} className="rounded-lg bg-white/10 px-3 py-2 text-slate-100 hover:bg-white/20">Reactivar</button></div>
            <div className="flex items-end gap-2"><label className="text-[11px] text-slate-400">Mudar plano<select value={planKey} onChange={(e) => setPlanKey(e.target.value)} className="mt-1 block rounded-lg border border-white/10 bg-slate-950 px-2 py-2 text-sm text-white">{plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
              <button disabled={!!busy || !planKey} onClick={() => act(r.orgId, { action: "setPlan", planKey }, `Mudar ${r.org} para o plano seleccionado? Não altera o período pago.`)} className="rounded-lg bg-white/10 px-3 py-2 text-slate-100 hover:bg-white/20">Aplicar</button></div>
            <button disabled={!!busy} onClick={() => act(r.orgId, { action: "suspend" }, `Suspender ${r.org}? Perde logo o acesso de escrita.`)} className="rounded-lg border border-rose-300/30 px-3 py-2 text-rose-200">Suspender</button>
          </div></td></tr>}
        </Fragment>; })}
        {shown.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Nenhuma empresa neste filtro.</td></tr>}</tbody></table></div>
  </div>;
}

export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  return <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[720px] text-left text-xs">
    <thead className="bg-white/[.03] text-slate-500"><tr><th className="p-3 font-medium">Data</th><th className="p-3 font-medium">Empresa</th><th className="p-3 font-medium">Referência</th><th className="p-3 font-medium">Plano</th><th className="p-3 font-medium">Valor</th><th className="p-3 font-medium">Resultado</th></tr></thead>
    <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-white/[.06]"><td className="p-3 text-slate-400">{dt(r.at, true)}</td><td className="p-3 text-slate-100">{r.org}</td><td className="p-3 font-mono text-slate-300">{r.reference}</td><td className="p-3 text-slate-300">{r.plan}</td><td className="p-3 text-slate-200">{kz(r.amount)}</td>
      <td className="p-3">{r.status === "PAID" ? <span className="text-emerald-300">Confirmado até {dt(r.periodEnd)}</span> : <span className="text-rose-300">Rejeitado{r.note ? ` — ${r.note}` : ""}</span>}</td></tr>)}
      {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Ainda sem pagamentos tratados.</td></tr>}</tbody></table></div>;
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const { run, busy, error } = useAction();
  const [v, setV] = useState(initial); const [saved, setSaved] = useState(false);
  const field = (k: keyof Settings, label: string, ph = "") => <label className="text-[11px] text-slate-400">{label}<input value={v[k]} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setSaved(false); }} placeholder={ph} maxLength={300} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600" /></label>;
  return <form onSubmit={async (e) => { e.preventDefault(); setSaved(await run("s", "/api/admin/billing/settings", "PUT", v)); }} className="max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-white/[.025] p-5">
    <p className="text-xs text-slate-400">Estes dados aparecem ao cliente quando ele gera uma referência de pagamento. O número de WhatsApp é onde recebes os comprovativos.</p>
    <div className="grid gap-3 sm:grid-cols-2">{field("admin_whatsapp", "O teu WhatsApp (formato internacional)", "244923000000")}{field("pay_express", "Multicaixa Express (número)", "923 000 000")}{field("pay_bank", "Banco", "BAI")}{field("pay_holder", "Titular da conta")}</div>
    {field("pay_iban", "IBAN", "AO06 0000 0000 0000 0000 0000 0")}{field("pay_note", "Nota para o cliente (opcional)")}
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    <div className="flex items-center gap-3"><button disabled={!!busy} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "A guardar…" : "Guardar"}</button>{saved && <span className="text-xs text-emerald-300">Guardado.</span>}</div>
  </form>;
}
