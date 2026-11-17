"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível criar a conta.");
      router.push("/onboarding");
    } catch (err) { setError(err instanceof Error ? err.message : "Erro inesperado."); } finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center px-5 py-12"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
    <div className="mb-8"><div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-indigo-500 text-xl font-black">I</div><p className="text-xs font-semibold uppercase tracking-[.2em] text-indigo-300">InvoiceFlow</p><h1 className="mt-2 text-2xl font-semibold">Cria a tua conta</h1><p className="mt-2 text-sm text-slate-400">Começa a organizar as finanças da tua empresa.</p></div>
    <label className="mb-2 block text-sm text-slate-300">Nome completo</label><input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"/>
    <label className="mb-2 block text-sm text-slate-300">E-mail</label><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mb-4 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"/>
    <label className="mb-2 block text-sm text-slate-300">Palavra-passe</label><input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="mb-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"/><p className="mb-5 text-xs text-slate-500">Mínimo de 10 caracteres e variedade de caracteres.</p>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
    <button disabled={busy} className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">{busy ? "A criar conta…" : "Criar conta"}</button>
    <p className="mt-6 text-center text-sm text-slate-400">Já tens conta? <Link className="text-indigo-300 hover:text-indigo-200" href="/login">Entrar</Link></p>
  </form></main>;
}
