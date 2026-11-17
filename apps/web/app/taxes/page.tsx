"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Tax = {
  id: string; name: string; rate: string | number; kind: "VAT" | "SALES_TAX" | "WITHHOLDING" | "OTHER";
  country: string | null; region: string | null; exempt: boolean; isDefault: boolean; active: boolean;
};
const empty = { name: "", rate: "0", kind: "VAT" as Tax["kind"], country: "", region: "", exempt: false, isDefault: false };

export default function TaxesPage() {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/taxes");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar os impostos.");
    setTaxes(data.taxes);
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  function edit(tax: Tax) {
    setEditing(tax.id);
    setForm({ name: tax.name, rate: String(tax.rate), kind: tax.kind, country: tax.country || "", region: tax.region || "", exempt: tax.exempt, isDefault: tax.isDefault });
    setShow(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(editing ? `/api/taxes/${editing}` : "/api/taxes", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, rate: Number(form.rate) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível guardar.");
      setShow(false); setEditing(null); setForm(empty); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); }
    finally { setBusy(false); }
  }
  async function archive(id: string) {
    if (!window.confirm("Desactivar esta taxa? Os registos antigos serão preservados.")) return;
    const response = await fetch(`/api/taxes/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) setError(data.error || "Não foi possível desactivar."); else await load();
  }
  const labels: Record<Tax["kind"], string> = { VAT: "IVA / VAT", SALES_TAX: "Imposto sobre vendas", WITHHOLDING: "Retenção na fonte", OTHER: "Outro" };

  return <main className="min-h-screen">
    <header className="border-b border-white/10 bg-slate-950/50 px-5 py-5 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div><Link href="/" className="text-sm text-indigo-300">← Dashboard</Link><h1 className="mt-2 text-2xl font-semibold">Impostos e taxas</h1><p className="mt-1 text-sm text-slate-400">Configura taxas fiscais da tua organização e define a taxa padrão.</p></div>
        <button onClick={() => { setEditing(null); setForm(empty); setShow(true); }} className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold">+ Nova taxa</button>
      </div>
    </header>
    <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[{ label: "Taxas configuradas", value: taxes.length }, { label: "Activas", value: taxes.filter(t => t.active).length }, { label: "Taxa padrão", value: taxes.find(t => t.isDefault)?.name || "Não definida" }].map(item => <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-900/65 p-5"><p className="text-sm text-slate-400">{item.label}</p><p className="mt-3 text-xl font-semibold">{item.value}</p></div>)}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[.03] text-xs text-slate-500"><tr><th className="px-5 py-4">Nome</th><th className="px-5 py-4">Tipo</th><th className="px-5 py-4">Taxa</th><th className="px-5 py-4">Jurisdição</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4 text-right">Acções</th></tr></thead>
          <tbody>{taxes.map(tax => <tr key={tax.id} className="border-t border-white/[.06]">
            <td className="px-5 py-4"><div className="font-medium">{tax.name}</div>{tax.isDefault && <span className="mt-1 inline-block rounded-full bg-indigo-500/15 px-2 py-1 text-[10px] text-indigo-200">Padrão</span>}</td>
            <td className="px-5 py-4 text-slate-400">{labels[tax.kind]}{tax.exempt ? " · Isento" : ""}</td>
            <td className="px-5 py-4 font-semibold tabular-nums">{Number(tax.rate).toLocaleString("pt-PT", { maximumFractionDigits: 3 })}%</td>
            <td className="px-5 py-4 text-slate-400">{[tax.country, tax.region].filter(Boolean).join(" · ") || "Global"}</td>
            <td className="px-5 py-4"><span className={tax.active ? "text-emerald-300" : "text-slate-500"}>{tax.active ? "Activa" : "Inactiva"}</span></td>
            <td className="px-5 py-4 text-right"><button onClick={() => edit(tax)} className="mr-3 text-indigo-300">Editar</button>{tax.active && <button onClick={() => archive(tax.id)} className="text-rose-300">Desactivar</button>}</td>
          </tr>)}</tbody>
        </table></div>
        {taxes.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Ainda não existem taxas fiscais. Adiciona a primeira.</div>}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">A configuração de taxas não substitui aconselhamento fiscal. Confirma as taxas e regras aplicáveis em cada país antes de emitir documentos.</p>
    </section>
    {show && <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <form onSubmit={save} className="my-8 w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">{editing ? "Editar taxa" : "Nova taxa"}</h2><button type="button" onClick={() => setShow(false)} className="text-slate-400">Fechar ✕</button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-300 sm:col-span-2">Nome *<input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex.: IVA geral" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3" /></label>
          <label className="text-sm text-slate-300">Taxa (%) *<input required type="number" min="0" max="100" step="0.001" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3" /></label>
          <label className="text-sm text-slate-300">Tipo<select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as Tax["kind"] }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3"><option value="VAT">IVA / VAT</option><option value="SALES_TAX">Imposto sobre vendas</option><option value="WITHHOLDING">Retenção na fonte</option><option value="OTHER">Outro</option></select></label>
          <label className="text-sm text-slate-300">País (ISO)<input maxLength={2} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value.toUpperCase() }))} placeholder="AO" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3" /></label>
          <label className="text-sm text-slate-300">Região / província<input maxLength={80} value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="Opcional" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3" /></label>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={form.exempt} onChange={e => setForm(f => ({ ...f, exempt: e.target.checked, isDefault: e.target.checked ? false : f.isDefault }))} /> Regime isento</label>
        <label className="mt-3 flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={form.isDefault} disabled={form.exempt} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} /> Definir como taxa padrão da empresa</label>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        <button disabled={busy} className="mt-5 w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-50">{busy ? "A guardar…" : "Guardar taxa"}</button>
      </form>
    </div>}
  </main>;
}
