"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Calculator, CircleHelp, Download, Lightbulb, ShieldCheck, Target, Wallet } from "lucide-react";

type Currency = "AOA" | "USD" | "EUR" | "GBP";
const initial = { currency: "AOA" as Currency, capital: "500000", fixed: "120000", variable: "2500", price: "7500", units: "30", ownerPay: "100000" };

function amount(raw: string) {
  try {
    if (!raw.trim()) return new Decimal(0);
    if (!/^\d{1,12}(?:\.\d{0,2})?$/.test(raw.trim())) return new Decimal(0);
    return new Decimal(raw);
  } catch { return new Decimal(0); }
}
function money(value: Decimal, currency: Currency) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, maximumFractionDigits: currency === "AOA" ? 0 : 2 }).format(value.toDecimalPlaces(currency === "AOA" ? 0 : 2, Decimal.ROUND_HALF_UP).toNumber());
}
function Field({ label, hint, value, onChange, prefix, min = "0" }: { label: string; hint: string; value: string; onChange: (v: string) => void; prefix?: string; min?: string }) {
  return <label className="block">
    <span className="block text-sm font-medium text-slate-200">{label}</span>
    <span className="mt-2 flex items-center rounded-xl border border-white/10 bg-[#080f1d] focus-within:border-indigo-400/60 focus-within:ring-2 focus-within:ring-indigo-400/10">
      {prefix && <span className="pl-3 text-sm text-slate-500">{prefix}</span>}
      <input type="number" inputMode="decimal" min={min} step="0.01" value={value} onChange={e => onChange(e.target.value)} className="w-full min-w-0 bg-transparent px-3 py-3 text-sm text-white outline-none" />
    </span>
    <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span>
  </label>;
}

export default function BusinessPlannerPage() {
  const [form, setForm] = useState(initial);
  const update = (key: keyof typeof initial, value: string) => setForm(old => ({ ...old, [key]: value }));
  const result = useMemo(() => {
    const capital = amount(form.capital);
    const fixed = amount(form.fixed);
    const variable = amount(form.variable);
    const price = amount(form.price);
    const units = amount(form.units);
    const ownerPay = amount(form.ownerPay);
    const contribution = price.minus(variable);
    const monthlyTarget = fixed.plus(ownerPay);
    const validUnits = units.gt(0);
    const canBreakEven = contribution.gt(0);
    const breakEven = canBreakEven ? monthlyTarget.div(contribution).ceil() : null;
    const minimumPrice = validUnits ? variable.plus(monthlyTarget.div(units)) : null;
    const monthlyProfit = contribution.mul(units).minus(monthlyTarget);
    const margin = price.gt(0) ? contribution.div(price).mul(100) : new Decimal(0);
    const runway = monthlyTarget.gt(0) ? capital.div(monthlyTarget) : null;
    return { capital, fixed, variable, price, units, ownerPay, contribution, monthlyTarget, canBreakEven, breakEven, minimumPrice, monthlyProfit, margin, runway, validUnits };
  }, [form]);
  const currency = form.currency;
  const positiveProfit = result.monthlyProfit.gte(0);
  const validPrice = result.price.gt(result.variable);
  const updateCurrency = (value: string) => setForm(old => ({ ...old, currency: value as Currency }));

  return <main className="mx-auto max-w-7xl space-y-7 pb-10">
    <header className="relative overflow-hidden rounded-3xl border border-indigo-300/15 bg-gradient-to-br from-[#172345] via-[#111b31] to-[#0b1424] p-6 shadow-2xl shadow-indigo-950/20 sm:p-9">
      <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl"/>
      <div className="relative grid gap-7 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-100"><Calculator size={13}/> Ferramenta de planeamento</span>
          <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">Descobre se o teu negócio pode dar lucro antes de começar.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">Simula preços, custos e vendas. Descobre quantas vendas precisas para cobrir as despesas, quanto cobrar e durante quanto tempo o teu capital pode sustentar a operação — mesmo sem teres facturado ainda.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[.06] px-3 py-2 text-xs text-slate-300"><ShieldCheck size={14} className="text-emerald-300"/> Não precisas de receita real</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[.06] px-3 py-2 text-xs text-slate-300"><Target size={14} className="text-indigo-300"/> Cenários ajustáveis</span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#080f1d]/65 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Wallet size={17} className="text-indigo-300"/> O teu cenário</div>
          <label className="mt-4 block text-xs font-medium text-slate-400">Moeda de simulação</label>
          <select value={currency} onChange={e => updateCurrency(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111c30] px-3 py-3 text-sm text-white outline-none focus:border-indigo-400">
            <option value="AOA">Kwanza (AOA)</option><option value="USD">Dólar americano (USD)</option><option value="EUR">Euro (EUR)</option><option value="GBP">Libra esterlina (GBP)</option>
          </select>
          <p className="mt-3 text-xs leading-5 text-slate-500">Esta moeda serve apenas para esta simulação. Não altera a moeda legal ou contabilística da tua empresa.</p>
        </div>
      </div>
    </header>

    <section className="grid gap-6 xl:grid-cols-[1fr_.9fr]">
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-7">
        <div className="mb-6"><h2 className="text-lg font-semibold">1. Introduz os teus números</h2><p className="mt-1 text-sm text-slate-400">Podes começar com estimativas. Os resultados actualizam-se automaticamente.</p></div>
        <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
          <Field label="Capital disponível" hint="Dinheiro que tens reservado para iniciar ou manter o negócio." value={form.capital} onChange={v => update("capital", v)} prefix={currency}/>
          <Field label="Custos fixos mensais" hint="Renda, internet, salários, software, energia e outros custos recorrentes." value={form.fixed} onChange={v => update("fixed", v)} prefix={currency}/>
          <Field label="Custo variável por venda" hint="Quanto gastas para entregar uma unidade ou serviço." value={form.variable} onChange={v => update("variable", v)} prefix={currency}/>
          <Field label="Preço de venda" hint="Quanto pretendes cobrar por unidade ou serviço." value={form.price} onChange={v => update("price", v)} prefix={currency}/>
          <Field label="Vendas previstas por mês" hint="Quantidade realista que esperas vender num mês." value={form.units} onChange={v => update("units", v)} min="1"/>
          <Field label="Retirada mensal desejada" hint="Quanto queres reservar para pagar a ti próprio. Podes começar em zero." value={form.ownerPay} onChange={v => update("ownerPay", v)} prefix={currency}/>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.08] pt-5">
          <button onClick={() => setForm(initial)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[.06]">Repor valores de exemplo</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-400"><Download size={16}/> Guardar / imprimir relatório</button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">2. Resultado da simulação</h2><p className="mt-1 text-sm text-slate-400">Estimativa mensal com os valores introduzidos.</p></div><span className="rounded-xl bg-indigo-400/10 p-3 text-indigo-200"><Calculator size={20}/></span></div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-[#080f1d] p-5">
            <p className="text-xs font-medium text-slate-400">Resultado mensal estimado</p>
            <p className={`mt-2 text-3xl font-semibold tracking-tight ${positiveProfit ? "text-emerald-300" : "text-rose-300"}`}>{money(result.monthlyProfit, currency)}</p>
            <p className="mt-2 text-xs text-slate-500">{positiveProfit ? "O cenário prevê excedente depois dos custos e da tua retirada." : "Com este cenário, as vendas previstas ainda não cobrem todos os custos."}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-xs text-slate-500">Vendas para atingir equilíbrio</p><p className="mt-2 text-xl font-semibold">{result.canBreakEven ? result.breakEven!.toFixed(0) : "—"}</p><p className="mt-1 text-[11px] text-slate-500">Unidades por mês</p></div>
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-xs text-slate-500">Preço mínimo estimado</p><p className="mt-2 text-xl font-semibold">{result.minimumPrice ? money(result.minimumPrice, currency) : "—"}</p><p className="mt-1 text-[11px] text-slate-500">Para a quantidade prevista</p></div>
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-xs text-slate-500">Margem de contribuição</p><p className="mt-2 text-xl font-semibold">{validPrice ? result.margin.toDecimalPlaces(1).toString() + "%" : "0%"}</p><p className="mt-1 text-[11px] text-slate-500">Depois do custo variável</p></div>
            <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-xs text-slate-500">Autonomia do capital</p><p className="mt-2 text-xl font-semibold">{result.runway ? result.runway.toDecimalPlaces(1).toString() + " meses" : "—"}</p><p className="mt-1 text-[11px] text-slate-500">Com custos fixos e retirada</p></div>
          </div>
          {!validPrice && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[.06] p-3 text-xs leading-5 text-rose-200">O preço de venda deve ser superior ao custo variável por unidade. Caso contrário, cada venda aumenta o prejuízo.</p>}
          {result.fixed.plus(result.ownerPay).gt(result.capital) && <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">Atenção: o capital disponível não cobre sequer um mês de custos fixos e retirada previstos.</p>}
        </div>

        <div className="rounded-2xl border border-indigo-300/15 bg-gradient-to-br from-indigo-500/10 to-cyan-500/[.04] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-100"><Lightbulb size={17}/> Leitura prática</div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{!validPrice ? "Rever o preço ou reduzir o custo de entrega é o primeiro passo. Não avances com um preço que perde dinheiro em cada venda." : result.monthlyProfit.lt(0) ? `Com as estimativas actuais, faltam ${money(result.monthlyProfit.abs(), currency)} por mês para cobrir custos e retirada. Podes testar um preço maior, mais vendas ou custos fixos menores.` : `O cenário apresenta ${money(result.monthlyProfit, currency)} de excedente mensal estimado. Compara este valor com a tua meta e testa um cenário mais conservador antes de tomar decisões.`}</p>
          <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><CircleHelp size={15} className="mt-0.5 shrink-0"/> Estimativa de gestão, não é previsão garantida nem aconselhamento fiscal. Ainda não inclui impostos, comissões de pagamento, descontos, devoluções ou sazonalidade.</div>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-white/10 bg-slate-900/55 p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">3. Transforma a simulação em acção</h2><p className="mt-1 text-sm text-slate-400">Quando estiveres pronto, passa do planeamento para a operação.</p></div><span className="text-xs text-slate-500">Próximos passos</span></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Link href="/products" className="group rounded-xl border border-white/[.08] bg-white/[.025] p-4 transition hover:border-indigo-300/30 hover:bg-indigo-400/[.05]"><p className="text-sm font-semibold">Registar produtos e serviços</p><p className="mt-2 text-xs leading-5 text-slate-500">Organiza custos, preços e aquilo que vais vender.</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-indigo-300">Abrir catálogo <ArrowRight size={14}/></span></Link>
        <Link href="/clients" className="group rounded-xl border border-white/[.08] bg-white/[.025] p-4 transition hover:border-indigo-300/30 hover:bg-indigo-400/[.05]"><p className="text-sm font-semibold">Preparar carteira de clientes</p><p className="mt-2 text-xs leading-5 text-slate-500">Regista os primeiros contactos e organiza oportunidades.</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-indigo-300">Ver clientes <ArrowRight size={14}/></span></Link>
        <Link href="/quotes" className="group rounded-xl border border-white/[.08] bg-white/[.025] p-4 transition hover:border-indigo-300/30 hover:bg-indigo-400/[.05]"><p className="text-sm font-semibold">Enviar o primeiro orçamento</p><p className="mt-2 text-xs leading-5 text-slate-500">Apresenta preços profissionais antes de emitir a factura.</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-indigo-300">Criar orçamento <ArrowRight size={14}/></span></Link>
      </div>
    </section>
    <style jsx global>{`@media print { body { background: white !important; color: #111827 !important; } aside, header, button, nav { display: none !important; } main { max-width: none !important; padding: 0 !important; } main * { color: #111827 !important; box-shadow: none !important; } main section, main div { break-inside: avoid; } }`}</style>
  </main>;
}
