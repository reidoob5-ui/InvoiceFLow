import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, SITE_NAME } from "@/lib/site";

export type LegalSection = { title: string; body: string[] };

export default function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return <main className="min-h-screen bg-[#080d18] px-5 py-12 text-slate-200 sm:px-8">
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-xs font-semibold text-indigo-300 hover:text-white">← {SITE_NAME}</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">{title}</h1>
      <p className="mt-2 text-xs text-slate-500">Última actualização: {LEGAL_UPDATED}</p>
      <p className="mt-6 text-sm leading-7 text-slate-300">{intro}</p>
      <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Texto-modelo. O operador do serviço deve revê-lo com um advogado e adaptá-lo à sua entidade, jurisdição e práticas reais antes de o considerar definitivo.</p>
      <div className="mt-8 space-y-8">
        {sections.map((s, i) => <section key={s.title}>
          <h2 className="text-lg font-semibold text-white">{i + 1}. {s.title}</h2>
          <div className="mt-2 space-y-3 text-sm leading-7 text-slate-400">{s.body.map(p => <p key={p}>{p}</p>)}</div>
        </section>)}
        <section>
          <h2 className="text-lg font-semibold text-white">{sections.length + 1}. Contacto</h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">{CONTACT_EMAIL ? <>Para qualquer questão sobre este documento, escreve para <a className="text-indigo-300 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</> : "Para qualquer questão sobre este documento, usa os canais de suporte indicados na aplicação."}</p>
        </section>
      </div>
      <nav className="mt-12 flex gap-5 border-t border-white/10 pt-6 text-xs text-slate-500"><Link href="/terms" className="hover:text-white">Termos de utilização</Link><Link href="/privacy" className="hover:text-white">Política de privacidade</Link></nav>
    </div>
  </main>;
}
