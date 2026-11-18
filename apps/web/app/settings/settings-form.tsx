"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Globe2, ReceiptText, Save, ShieldCheck } from "lucide-react";

type Organization = {
  id: string; name: string; legalName: string | null; taxId: string | null; email: string | null;
  phone: string | null; website: string | null; addressLine1: string | null; addressLine2: string | null;
  city: string | null; postalCode: string | null; country: string; currency: string; timezone: string;
  locale: string; defaultPaymentTerms: number; invoicePrefix: string; quotePrefix: string;
  invoiceNotes: string | null; invoiceTerms: string | null;
};
type FormState = Record<keyof Omit<Organization, "id">, string>;
const blank: FormState = {
  name: "", legalName: "", taxId: "", email: "", phone: "", website: "", addressLine1: "",
  addressLine2: "", city: "", postalCode: "", country: "AO", currency: "AOA", timezone: "Africa/Luanda",
  locale: "pt", defaultPaymentTerms: "30", invoicePrefix: "INV", quotePrefix: "QT", invoiceNotes: "", invoiceTerms: "",
};

function toForm(org: Organization): FormState {
  return Object.fromEntries(Object.keys(blank).map(key => [key, String(org[key as keyof FormState] ?? "")])) as FormState;
}
const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-[#080d18] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400";
const labelClass = "block text-sm font-medium text-slate-300";

export default function CompanySettingsForm() {
  const [form, setForm] = useState<FormState>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/organizations/settings", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar as definições.");
    setForm(toForm(data.organization));
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [load]);

  function update(key: keyof FormState, value: string) {
    setForm(current => ({ ...current, [key]: value }));
    setSuccess("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const payload = { ...form, defaultPaymentTerms: Number(form.defaultPaymentTerms) };
      const response = await fetch("/api/organizations/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível guardar as alterações.");
      setForm(toForm(data.organization));
      setSuccess("Definições da empresa guardadas com sucesso.");
    } catch (e) { setError(e instanceof Error ? e.message : "Ocorreu um erro inesperado."); }
    finally { setSaving(false); }
  }

  if (loading) return <main className="mx-auto max-w-5xl px-5 py-12"><div className="animate-pulse rounded-2xl border border-white/10 bg-slate-900/60 p-10 text-sm text-slate-400">A carregar definições da empresa…</div></main>;

  const field = (key: keyof FormState, label: string, placeholder = "", type = "text") => (
    <label className={labelClass}>{label}<input type={type} value={form[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder} className={inputClass}/></label>
  );

  return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
    <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-indigo-300 hover:text-white"><ArrowLeft size={15}/> Voltar ao painel</Link>
    <header className="my-7"><p className="text-[10px] font-bold uppercase tracking-[.24em] text-indigo-300">Configuração empresarial</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Definições da empresa</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Mantém os dados legais, fiscais e de apresentação actualizados. Estas definições pertencem à empresa e não são alteradas pelo idioma do visitante.</p></header>
    {error && <p role="alert" className="mb-5 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}
    {success && <p role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle2 size={17}/>{success}</p>}
    <form onSubmit={save} className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15 text-indigo-200"><Building2 size={19}/></span><div><h2 className="font-semibold">Identidade e contacto</h2><p className="mt-1 text-xs text-slate-500">Informações que identificam a tua organização.</p></div></div>
        <div className="grid gap-5 sm:grid-cols-2">
          {field("name","Nome comercial *","Ex.: Minha Empresa")}
          {field("legalName","Nome legal / denominação social","Ex.: Minha Empresa, Lda.")}
          {field("taxId","NIF / Identificação fiscal","Número fiscal da empresa")}
          {field("email","E-mail empresarial","financeiro@empresa.com","email")}
          {field("phone","Telefone","+244 9xx xxx xxx","tel")}
          {field("website","Website","https://empresa.com","url")}
        </div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-500/15 text-cyan-200"><Globe2 size={19}/></span><div><h2 className="font-semibold">Endereço e contexto regional</h2><p className="mt-1 text-xs text-slate-500">País, moeda legal e fuso horário da organização.</p></div></div>
        <div className="grid gap-5 sm:grid-cols-2">
          {field("addressLine1","Morada","Rua, avenida e número")}
          {field("addressLine2","Complemento","Edifício, andar ou sala")}
          {field("city","Cidade / município","Luanda")}
          {field("postalCode","Código postal","Opcional")}
          {field("country","País (código ISO)","AO")}
          {field("currency","Moeda (código ISO)","AOA")}
          {field("timezone","Fuso horário IANA","Africa/Luanda")}
          <label className={labelClass}>Idioma padrão da empresa<select value={form.locale} onChange={e => update("locale",e.target.value)} className={inputClass}><option value="pt">Português</option><option value="en">English</option><option value="fr">Français</option><option value="es">Español</option></select></label>
        </div>
        <p className="mt-5 rounded-xl border border-amber-300/15 bg-amber-400/[.06] p-4 text-xs leading-5 text-amber-100/80">A moeda e o país configurados aplicam-se às novas operações e documentos. Os documentos antigos mantêm a moeda em que foram emitidos. Não fazemos conversões automáticas entre moedas.</p>
      </section>
      <section className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><ReceiptText size={19}/></span><div><h2 className="font-semibold">Predefinições de facturação</h2><p className="mt-1 text-xs text-slate-500">Valores utilizados como ponto de partida nos novos documentos.</p></div></div>
        <div className="grid gap-5 sm:grid-cols-3">
          {field("invoicePrefix","Prefixo das facturas","INV")}
          {field("quotePrefix","Prefixo dos orçamentos","QT")}
          {field("defaultPaymentTerms","Prazo padrão (dias)","30","number")}
        </div>
        <div className="mt-5 grid gap-5">
          <label className={labelClass}>Notas padrão nas facturas<textarea maxLength={4000} rows={3} value={form.invoiceNotes} onChange={e=>update("invoiceNotes",e.target.value)} className={inputClass} placeholder="Notas que podem aparecer nos documentos."/></label>
          <label className={labelClass}>Termos e condições padrão<textarea maxLength={4000} rows={4} value={form.invoiceTerms} onChange={e=>update("invoiceTerms",e.target.value)} className={inputClass} placeholder="Condições de pagamento, entrega e outras cláusulas."/></label>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-5">
        <div className="flex items-start gap-3 text-xs leading-5 text-slate-400"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300"/><span>As alterações ficam registadas no histórico de auditoria da empresa. Apenas proprietários e administradores podem guardar estas definições.</span></div>
        <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-indigo-950/40 transition hover:-translate-y-0.5 disabled:opacity-50"><Save size={16}/>{saving ? "A guardar…" : "Guardar definições"}</button>
      </div>
    </form>
  </main>;
}
