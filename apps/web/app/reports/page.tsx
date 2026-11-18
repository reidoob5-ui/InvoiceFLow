"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Summary = {
  currency: string; cashIn: string; operatingExpenses: string; supplierPayments: string; netCashFlow: string;
  invoiced: string; receivables: string; overdueReceivables: string; payables: string; overduePayables: string;
};
type Timeline = { month: string; currency: string; inflows: string; outflows: string };
type Category = { currency: string; category: string; amount: string };
type Overdue = { id: string; number: string | null; client?: string; supplier?: string; currency: string; balance: string; dueDate: string };
type ReportData = { summary: Summary[]; timeline: Timeline[]; expensesByCategory: Category[]; overdueInvoices: Overdue[]; overdueBills: Overdue[] };

function dateValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function money(value: string, currency: string) {
  try { return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)); }
  catch { return value + " " + currency; }
}
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}
function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + text.replace(/"/g, '""') + '"';
}

export default function ReportsPage() {
  const initialTo = new Date();
  const initialFrom = new Date();
  initialFrom.setMonth(initialFrom.getMonth() - 5);
  initialFrom.setDate(1);
  const [from, setFrom] = useState(dateValue(initialFrom));
  const [to, setTo] = useState(dateValue(initialTo));
  const [currency, setCurrency] = useState("ALL");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/reports?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar os relatórios.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar os relatórios.");
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const currencies = useMemo(() => data?.summary.map(item => item.currency) ?? [], [data]);
  const visibleSummary = useMemo(() => (data?.summary ?? []).filter(item => currency === "ALL" || item.currency === currency), [data, currency]);
  const chartData = useMemo(() => {
    const rows = (data?.timeline ?? []).filter(item => currency === "ALL" || item.currency === currency);
    const months = [...new Set(rows.map(item => item.month))].sort();
    return months.map(month => {
      const items = rows.filter(item => item.month === month);
      return { month: monthLabel(month), monthKey: month,
        inflows: items.reduce((sum, item) => sum + Number(item.inflows), 0),
        outflows: items.reduce((sum, item) => sum + Number(item.outflows), 0) };
    });
  }, [data, currency]);
  const categories = (data?.expensesByCategory ?? []).filter(item => currency === "ALL" || item.currency === currency);
  const overdueInvoices = (data?.overdueInvoices ?? []).filter(item => currency === "ALL" || item.currency === currency);
  const overdueBills = (data?.overdueBills ?? []).filter(item => currency === "ALL" || item.currency === currency);

  function exportCsv() {
    if (!data) return;
    const rows: unknown[][] = [["Tipo", "Moeda", "Descrição", "Valor", "Detalhe"]];
    for (const item of visibleSummary) {
      rows.push(["Resumo", item.currency, "Entradas recebidas", item.cashIn, ""]);
      rows.push(["Resumo", item.currency, "Despesas operacionais pagas", item.operatingExpenses, ""]);
      rows.push(["Resumo", item.currency, "Pagamentos a fornecedores", item.supplierPayments, ""]);
      rows.push(["Resumo", item.currency, "Fluxo líquido de caixa", item.netCashFlow, ""]);
      rows.push(["Resumo", item.currency, "Facturação emitida", item.invoiced, ""]);
      rows.push(["Resumo", item.currency, "Valores por receber", item.receivables, ""]);
      rows.push(["Resumo", item.currency, "Valores em atraso", item.overdueReceivables, ""]);
    }
    for (const item of categories) rows.push(["Despesa", item.currency, item.category, item.amount, ""]);
    for (const item of (data.timeline ?? []).filter(item => currency === "ALL" || item.currency === currency)) {
      rows.push(["Fluxo mensal", item.currency, item.month + " · Entradas", item.inflows, ""]);
      rows.push(["Fluxo mensal", item.currency, item.month + " · Saídas", item.outflows, ""]);
    }
    const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "invoiceflow-relatorio-financeiro.csv";
    anchor.click(); URL.revokeObjectURL(url);
  }

  const cards = [
    { label: "Entradas recebidas", key: "cashIn" as const, hint: "Pagamentos confirmados no período" },
    { label: "Despesas pagas", key: "operatingExpenses" as const, hint: "Despesas operacionais registadas" },
    { label: "Pagamentos a fornecedores", key: "supplierPayments" as const, hint: "Pagamentos de contas a pagar" },
    { label: "Fluxo líquido de caixa", key: "netCashFlow" as const, hint: "Entradas menos saídas efectivas" },
    { label: "Facturação emitida", key: "invoiced" as const, hint: "Facturas emitidas no período" },
    { label: "Por receber", key: "receivables" as const, hint: "Saldo em aberto das facturas" },
    { label: "Recebimentos em atraso", key: "overdueReceivables" as const, hint: "Facturas vencidas e não liquidadas" },
    { label: "Por pagar", key: "payables" as const, hint: "Saldo em aberto a fornecedores" },
  ];

  return (
    <main className="mx-auto max-w-[1500px]">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><Link href="/dashboard" className="text-xs text-indigo-300 hover:text-white">← Visão geral</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Relatórios financeiros</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Acompanha o dinheiro que entra e sai, a rentabilidade operacional e os saldos pendentes da empresa.</p>
        </div>
        <button onClick={exportCsv} disabled={!data || loading} className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-40">Exportar CSV ↓</button>
      </header>

      <section className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <label className="grid gap-1 text-xs text-slate-400">De<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} className="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"/></label>
        <label className="grid gap-1 text-xs text-slate-400">Até<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} className="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"/></label>
        <label className="grid gap-1 text-xs text-slate-400">Moeda<select value={currency} onChange={event => setCurrency(event.target.value)} className="min-w-32 rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"><option value="ALL">Todas (separadas)</option>{currencies.map(code => <option key={code} value={code}>{code}</option>)}</select></label>
        <button onClick={() => void load()} disabled={loading} className="rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">{loading ? "A actualizar..." : "Aplicar filtros"}</button>
        <p className="ml-auto max-w-sm text-[11px] leading-5 text-slate-500">Os valores são apresentados por moeda. Não existe conversão automática nem soma de moedas diferentes.</p>
      </section>

      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {loading && !data ? <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-12 text-center text-sm text-slate-400">A preparar os teus relatórios...</div> : null}
      {data && <>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Indicadores do período</h2><span className="text-xs text-slate-500">{visibleSummary.length} moeda(s)</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleSummary.flatMap(item => cards.map(card => <article key={item.currency + card.key} className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-lg shadow-black/10">
            <p className="text-xs text-slate-400">{card.label} <span className="ml-1 text-[10px] text-indigo-300">{item.currency}</span></p>
            <p className="mt-3 break-words text-xl font-semibold tracking-tight">{money(item[card.key], item.currency)}</p>
            <p className="mt-2 text-[10px] text-slate-500">{card.hint}</p>
          </article>))}
          {visibleSummary.length === 0 && <div className="col-span-full rounded-xl border border-white/10 p-8 text-center text-sm text-slate-400">Ainda não existem movimentos financeiros neste período.</div>}
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
            <h2 className="font-semibold">Fluxo de caixa mensal</h2><p className="mt-1 text-xs text-slate-500">Entradas confirmadas e saídas efectivamente pagas.</p>
            <div className="mt-5 h-72">
              {chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#263246"/>
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #334155", borderRadius: 12, color: "#e2e8f0" }}/>
                <Legend/>
                <Bar dataKey="inflows" name="Entradas" fill="#34d399" radius={[5,5,0,0]}/>
                <Bar dataKey="outflows" name="Saídas" fill="#fb7185" radius={[5,5,0,0]}/>
              </BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-slate-500">Sem movimentos de caixa no período.</div>}
            </div>
            {currency === "ALL" && <p className="mt-2 text-[10px] text-amber-300/80">Para comparar montantes no gráfico, selecciona uma moeda específica.</p>}
          </section>
          <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5">
            <h2 className="font-semibold">Despesas por categoria</h2><p className="mt-1 text-xs text-slate-500">Despesas pagas, agrupadas por moeda.</p>
            <div className="mt-5 space-y-3">
              {categories.length ? categories.slice(0, 12).map(item => <div key={item.currency + item.category} className="flex items-center justify-between gap-3 border-b border-white/[.06] pb-3"><div className="min-w-0"><p className="truncate text-sm text-slate-200">{item.category}</p><p className="text-[10px] text-slate-500">{item.currency}</p></div><p className="shrink-0 text-sm font-semibold">{money(item.amount, item.currency)}</p></div>) : <p className="py-10 text-center text-sm text-slate-500">Sem despesas categorizadas no período.</p>}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/65">
            <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Facturas em atraso</h2><p className="mt-1 text-xs text-slate-500">Clientes com saldo vencido.</p></div>
            {overdueInvoices.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-slate-500"><tr><th className="px-5 py-3">Factura</th><th className="px-3 py-3">Cliente</th><th className="px-5 py-3 text-right">Em dívida</th></tr></thead><tbody>{overdueInvoices.slice(0, 20).map(item => <tr key={item.id} className="border-t border-white/[.06]"><td className="px-5 py-3">{item.number || "Factura"}</td><td className="px-3 py-3 text-slate-400">{item.client}</td><td className="px-5 py-3 text-right font-semibold text-rose-300">{money(item.balance,item.currency)}</td></tr>)}</tbody></table></div> : <p className="p-8 text-center text-sm text-slate-500">Não há facturas vencidas neste período.</p>}
          </section>
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/65">
            <div className="border-b border-white/10 p-5"><h2 className="font-semibold">Contas de fornecedores em atraso</h2><p className="mt-1 text-xs text-slate-500">Pagamentos pendentes e vencidos.</p></div>
            {overdueBills.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-slate-500"><tr><th className="px-5 py-3">Documento</th><th className="px-3 py-3">Fornecedor</th><th className="px-5 py-3 text-right">Em dívida</th></tr></thead><tbody>{overdueBills.slice(0, 20).map(item => <tr key={item.id} className="border-t border-white/[.06]"><td className="px-5 py-3">{item.number || "Conta"}</td><td className="px-3 py-3 text-slate-400">{item.supplier}</td><td className="px-5 py-3 text-right font-semibold text-amber-300">{money(item.balance,item.currency)}</td></tr>)}</tbody></table></div> : <p className="p-8 text-center text-sm text-slate-500">Não há contas vencidas neste período.</p>}
          </section>
        </div>
      </>}
    </main>
  );
}
