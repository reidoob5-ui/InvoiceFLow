import Link from "next/link";
import PlanPicker from "./plan-picker";
import { ArrowLeft } from "lucide-react";
export default function PlansPage() {
  return <main className="relative min-h-screen overflow-hidden bg-[#070b14] px-5 py-8 text-white sm:px-8"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(99,102,241,.25),transparent_55%)] opacity-[.10]"/><div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#070b14]/90 via-[#070b14]/95 to-[#070b14]"/><div className="relative z-10 mx-auto max-w-7xl">
    <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16}/> Página inicial</Link>
    <div className="mx-auto mt-12 max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[.25em] text-indigo-300">Planos simples e transparentes</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Escolhe como queres crescer.</h1><p className="mt-5 text-sm leading-7 text-slate-400">Começa sem custos e muda de plano quando o teu negócio precisar. Os preços têm como referência o kwanza e podem ser apresentados noutras moedas.</p></div>
    <PlanPicker/><p className="mx-auto mt-10 max-w-3xl text-center text-[11px] leading-6 text-slate-500">Os valores apresentados em moedas diferentes de AOA são estimativas de conversão cambial. O valor final da cobrança dependerá da moeda e do meio de pagamento disponíveis no teu país.</p>
    <div className="mt-10 text-center text-sm text-slate-500">Já tens conta? <Link href="/login" className="font-semibold text-indigo-300 hover:text-white">Entrar</Link></div>
  </div></main>;
}