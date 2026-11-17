"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", organizationName: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function change(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível criar a conta.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
        <Link href="/" className="text-sm font-semibold text-indigo-300">← InvoiceFlow</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.22em] text-indigo-300">Começar</p>
        <h1 className="mt-2 text-3xl font-semibold">Criar espaço de trabalho</h1>
        <p className="mt-2 text-sm text-slate-400">Crie a sua conta e registe a primeira empresa.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm text-slate-300">Nome completo
            <input required minLength={2} maxLength={80} value={values.name} onChange={(e) => change("name", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400" />
          </label>
          <label className="block text-sm text-slate-300">Email
            <input required type="email" value={values.email} onChange={(e) => change("email", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400" />
          </label>
          <label className="block text-sm text-slate-300">Nome da empresa
            <input required minLength={2} maxLength={100} value={values.organizationName} onChange={(e) => change("organizationName", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400" />
          </label>
          <label className="block text-sm text-slate-300">Palavra-passe (mínimo 10 caracteres)
            <input required type="password" minLength={10} maxLength={72} value={values.password} onChange={(e) => change("password", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400" />
          </label>
          {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-60">{busy ? "A criar conta..." : "Criar conta"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">Já tem conta? <Link className="text-indigo-300" href="/login">Entrar</Link></p>
      </section>
    </main>
  );
}
