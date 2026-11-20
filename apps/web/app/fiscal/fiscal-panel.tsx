"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, KeyRound, RefreshCw, ShieldAlert, ListPlus } from "lucide-react";

type Profile = { nif: string; companyName: string; eacCode: string | null; environment: "HOMOLOGATION" | "PRODUCTION"; enabled: boolean; keyFingerprint: string | null; hasKey: boolean } | null;
type Series = { id: string; code: string; year: number; documentType: string; nextNumber: number; lastNumber: number | null; status: string; establishment: string };
type Status = {
  summary: Record<string, number>;
  overdue: Array<{ document: { documentNo: string }; state: string }>;
  dueSoon: Array<{ document: { documentNo: string }; deadlineAt: string }>;
  recent: Array<{ state: string; attempts: number; deadlineAt: string; errors: unknown; document: { documentNo: string; documentType: string; documentDate: string } }>;
};

const STATE_LABEL: Record<string, string> = { PENDING: "Por enviar", RETRY: "A repetir", SUBMITTED: "Enviada", VALID: "Válida", PENALIZED: "Válida (penalizada)", INVALID: "Rejeitada", BLOCKED: "Bloqueada" };
const STATE_TONE: Record<string, string> = { VALID: "text-emerald-300", PENALIZED: "text-amber-300", INVALID: "text-rose-300", BLOCKED: "text-rose-300", RETRY: "text-amber-300" };
const input = "w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-sm outline-none focus:border-indigo-400/50";

export default function FiscalPanel({ canWrite }: { canWrite: boolean }) {
  const [profile, setProfile] = useState<Profile>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nif: "", companyName: "", eacCode: "", environment: "HOMOLOGATION" });
  const [pem, setPem] = useState("");
  const [newSeries, setNewSeries] = useState({ year: new Date().getFullYear(), documentType: "FT" });

  const load = useCallback(async () => {
    const [p, s, st] = await Promise.all([fetch("/api/fiscal/profile"), fetch("/api/fiscal/series"), fetch("/api/fiscal/status")]);
    if (p.ok) {
      const j = await p.json();
      setProfile(j.profile);
      if (j.profile) setForm({ nif: j.profile.nif, companyName: j.profile.companyName, eacCode: j.profile.eacCode ?? "", environment: j.profile.environment });
    }
    if (s.ok) setSeries((await s.json()).series);
    if (st.ok) setStatus(await st.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(url: string, method: string, body?: unknown, okText = "Guardado.") {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      setMsg({ ok: res.ok, text: res.ok ? okText : (j.error ?? "Erro.") });
      if (res.ok) await load();
    } finally { setBusy(false); }
  }

  const prod = form.environment === "PRODUCTION";
  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="flex items-start gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-200"><Landmark size={20}/></span>
      <div><h1 className="text-2xl font-semibold">Facturação electrónica AGT</h1>
        <p className="mt-1 text-sm text-slate-400">Decreto Executivo 683/25: assinatura RS256, séries, QR e envio em até 24h.</p></div>
    </header>

    <div role="note" className="flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/[.07] p-4 text-sm leading-6 text-amber-100">
      <ShieldAlert size={18} className="mt-0.5 shrink-0"/>
      <p><b>Em homologação.</b> Este módulo ainda <b>não está certificado pela AGT</b>. Use o ambiente de homologação até obter a validação do software e as credenciais do produtor; só então mude para produção.</p>
    </div>

    {msg && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>{msg.text}</p>}

    <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5">
      <h2 className="font-semibold">Perfil fiscal do contribuinte</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">NIF<input className={input} value={form.nif} disabled={!canWrite} onChange={(e) => setForm({ ...form, nif: e.target.value })}/></label>
        <label className="text-xs text-slate-400">Nome fiscal<input className={input} value={form.companyName} disabled={!canWrite} onChange={(e) => setForm({ ...form, companyName: e.target.value })}/></label>
        <label className="text-xs text-slate-400">CAE (5 dígitos, opcional)<input className={input} value={form.eacCode} disabled={!canWrite} onChange={(e) => setForm({ ...form, eacCode: e.target.value })}/></label>
        <label className="text-xs text-slate-400">Ambiente<select className={input} value={form.environment} disabled={!canWrite} onChange={(e) => setForm({ ...form, environment: e.target.value })}><option value="HOMOLOGATION">Homologação (testes)</option><option value="PRODUCTION">Produção</option></select></label>
      </div>
      {canWrite && <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => call("/api/fiscal/profile", "PUT", form)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">Guardar perfil</button>
        {profile && <button disabled={busy || !profile.hasKey} onClick={() => call("/api/fiscal/profile", "PUT", { ...form, enabled: !profile.enabled }, profile.enabled ? "Facturação AGT desactivada." : "Facturação AGT activada.")} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium disabled:opacity-40">{profile.enabled ? "Desactivar" : "Activar"} facturação AGT</button>}
      </div>}
    </section>

    {profile && <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={16}/> Chave do contribuinte</h2>
      <p className="mt-1 text-sm text-slate-400">{profile.hasKey ? <>Chave guardada cifrada. Impressão digital: <code className="text-slate-200">{profile.keyFingerprint}</code></> : "Ainda sem chave. Cole a chave privada RSA (PEM, mínimo 2048 bits) emitida no portal da AGT."}</p>
      {canWrite && <>
        <textarea className={`${input} mt-3 h-28 font-mono text-xs`} placeholder="-----BEGIN PRIVATE KEY-----" value={pem} onChange={(e) => setPem(e.target.value)}/>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy || !pem.trim()} onClick={async () => { await call("/api/fiscal/key", "POST", { privateKeyPem: pem }, "Chave guardada (cifrada)."); setPem(""); }} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">Guardar chave</button>
          {!prod && <button disabled={busy} onClick={() => call("/api/fiscal/key", "POST", {}, "Par de chaves de teste gerado.")} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">Gerar chave de teste</button>}
        </div></>}
    </section>}

    {profile?.enabled && <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5">
      <h2 className="font-semibold">Séries de numeração</h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-2">Tipo</th><th>Código</th><th>Ano</th><th>Próximo nº</th><th>Estado</th></tr></thead>
        <tbody>{series.map((s) => <tr key={s.id} className="border-t border-white/5"><td className="py-2">{s.documentType}</td><td>{s.code}</td><td>{s.year}</td><td>{s.nextNumber}{s.lastNumber ? ` / ${s.lastNumber}` : ""}</td><td>{s.status === "F" ? "Fechada" : s.status === "U" ? "Em uso" : "Activa"}</td></tr>)}
          {series.length === 0 && <tr><td colSpan={5} className="py-4 text-slate-500">Ainda sem séries. Peça uma à AGT.</td></tr>}</tbody></table></div>
      {canWrite && <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">Tipo<select className={input} value={newSeries.documentType} onChange={(e) => setNewSeries({ ...newSeries, documentType: e.target.value })}>{["FT", "FR", "NC", "ND", "AR", "RG"].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-xs text-slate-400">Ano<input type="number" className={input} value={newSeries.year} onChange={(e) => setNewSeries({ ...newSeries, year: Number(e.target.value) })}/></label>
        <button disabled={busy} onClick={() => call("/api/fiscal/series", "POST", newSeries, "Série criada pela AGT.")} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"><ListPlus size={15}/> Pedir série à AGT</button>
      </div>}
    </section>}

    {profile?.enabled && status && <section className="rounded-3xl border border-white/10 bg-white/[.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Estado dos envios</h2>
        {canWrite && <button disabled={busy} onClick={() => call("/api/fiscal/sync", "POST", undefined, "Sincronização concluída.")} className="flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm"><RefreshCw size={14}/> Enviar / actualizar agora</button>}</div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">{Object.entries(status.summary).map(([k, v]) => <span key={k} className={`rounded-full bg-white/[.06] px-3 py-1 ${STATE_TONE[k] ?? "text-slate-300"}`}>{STATE_LABEL[k] ?? k}: {v}</span>)}</div>
      {status.overdue.length > 0 && <p className="mt-3 rounded-xl bg-rose-400/10 p-3 text-sm text-rose-200">{status.overdue.length} documento(s) passaram o prazo de 24h sem envio (risco de penalização).</p>}
      {status.dueSoon.length > 0 && <p className="mt-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{status.dueSoon.length} documento(s) com prazo a terminar na próxima hora.</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><tbody>{status.recent.map((r) => <tr key={r.document.documentNo} className="border-t border-white/5"><td className="py-2">{r.document.documentNo}</td><td>{r.document.documentDate}</td><td className={STATE_TONE[r.state] ?? ""}>{STATE_LABEL[r.state] ?? r.state}</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}
