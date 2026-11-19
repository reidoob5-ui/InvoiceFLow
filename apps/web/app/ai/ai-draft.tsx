"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, FilePlus2, Check } from "lucide-react";

type Line = { productId: string | null; description: string; quantity: number; unitPrice: number };
type Proposal = { clientId: string | null; clientName: string | null; newClientName: string | null; currency: string; paymentTermsDays: number | null; notes: string | null; lines: Line[]; question: string | null };
type ClientOpt = { id: string; name: string };

const EXAMPLES = ["Factura 3 horas de suporte técnico à Clínica Vida Nova, vence em 15 dias", "Uma licença de software anual para a Tech Angola Solutions", "2 consultorias mensais ao Hotel Marginal Sul"];

export default function AiDraft({ canWrite }: { canWrite: boolean }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [usage, setUsage] = useState<string>("");

  async function interpret(input: string) {
    if (loading || input.trim().length < 5) return;
    setLoading(true); setError(""); setProposal(null); setCreatedId(null);
    try {
      const res = await fetch("/api/ai/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: input }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao interpretar o pedido.");
      setProposal(data.proposal); setClients(data.clients); setClientId(data.proposal.clientId ?? "");
      setUsage(`${data.used}${data.limit === null ? "" : ` / ${data.limit}`} msgs este mês`);
    } catch (e) { setError(e instanceof Error ? e.message : "Ocorreu um erro."); }
    finally { setLoading(false); }
  }

  async function createDraft() {
    if (!proposal || !clientId || creating) return;
    setCreating(true); setError("");
    try {
      const res = await fetch("/api/invoices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        clientId, currency: proposal.currency, ...(proposal.paymentTermsDays !== null ? { paymentTermsDays: proposal.paymentTermsDays } : {}), notes: proposal.notes ?? "",
        lines: proposal.lines.map(l => l.productId ? { productId: l.productId, quantity: l.quantity } : { description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }),
      }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o rascunho.");
      setCreatedId(data.invoice.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Ocorreu um erro."); }
    finally { setCreating(false); }
  }

  const fmt = (n: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(n);
  const subtotal = proposal?.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) ?? 0;
  const ready = !!proposal && proposal.lines.length > 0 && !!clientId;

  return <div className="mx-auto max-w-3xl space-y-4">
    <div className="rounded-3xl border border-white/[.08] bg-white/[.02] p-5">
      <label htmlFor="ai-draft-text" className="text-sm font-semibold">Descreve a factura em linguagem normal</label>
      <textarea id="ai-draft-text" value={text} onChange={e => setText(e.target.value)} maxLength={1000} rows={3} disabled={!canWrite || loading}
        placeholder="Ex.: Factura 3 horas de suporte técnico à Clínica Vida Nova, vence em 15 dias"
        className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-indigo-400/50 disabled:opacity-50"/>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {EXAMPLES.map(e => <button key={e} type="button" disabled={!canWrite || loading} onClick={() => { setText(e); void interpret(e); }} className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-slate-400 hover:border-indigo-300/30 hover:text-white disabled:opacity-40">{e}</button>)}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-500">{usage || "A IA só propõe. Tu confirmas antes de criar."}</span>
        <button onClick={() => interpret(text)} disabled={!canWrite || loading || text.trim().length < 5} className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"><Sparkles size={15}/>{loading ? "A interpretar…" : "Interpretar"}</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
    {proposal && <div className="rounded-3xl border border-indigo-300/20 bg-indigo-500/[.06] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><FilePlus2 size={16}/> Rascunho proposto</h2>
      {proposal.question && <p className="mt-3 rounded-xl bg-amber-300/10 p-3 text-xs text-amber-100">{proposal.question}</p>}
      <div className="mt-4">
        <label htmlFor="ai-draft-client" className="text-xs text-slate-400">Cliente</label>
        <select id="ai-draft-client" value={clientId} onChange={e => setClientId(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#080d18] px-3 py-2.5 text-sm">
          <option value="">— escolhe um cliente —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!proposal.clientId && proposal.newClientName && <p className="mt-2 text-[11px] text-slate-400">“{proposal.newClientName}” ainda não existe. <Link href="/clients" className="text-indigo-300 underline">Cria o cliente</Link> e volta a interpretar, ou escolhe outro acima.</p>}
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-xs"><thead className="bg-white/[.04] text-left text-slate-500"><tr><th className="px-3 py-2 font-medium">Descrição</th><th className="px-3 py-2 text-right font-medium">Qtd.</th><th className="px-3 py-2 text-right font-medium">Preço</th><th className="px-3 py-2 text-right font-medium">Total</th></tr></thead>
          <tbody>{proposal.lines.map((l, i) => <tr key={i} className="border-t border-white/[.06]"><td className="px-3 py-2.5">{l.description}</td><td className="px-3 py-2.5 text-right">{l.quantity}</td><td className="px-3 py-2.5 text-right">{fmt(l.unitPrice)}</td><td className="px-3 py-2.5 text-right">{fmt(l.quantity * l.unitPrice)}</td></tr>)}
          {proposal.lines.length === 0 && <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-500">Sem linhas identificadas.</td></tr>}</tbody></table>
      </div>
      <p className="mt-3 text-right text-xs text-slate-400">Subtotal sem impostos: <strong className="text-slate-100">{fmt(subtotal)} {proposal.currency}</strong></p>
      <p className="mt-1 text-right text-[10px] text-slate-600">Os impostos são aplicados ao criar o rascunho, conforme o catálogo.</p>
      {createdId
        ? <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-400/10 p-3 text-xs text-emerald-200"><span className="flex items-center gap-2"><Check size={14}/> Rascunho criado.</span><Link href={`/invoices/${createdId}`} className="rounded-lg bg-white px-3 py-1.5 font-bold text-slate-950">Abrir rascunho</Link></div>
        : <button onClick={createDraft} disabled={!ready || creating} className="mt-4 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{creating ? "A criar…" : "Criar rascunho"}</button>}
    </div>}
  </div>;
}
