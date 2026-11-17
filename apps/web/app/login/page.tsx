"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar sessão.");
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
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
        <Link href="/" className="text-sm font-semibold text-indigo-300">← InvoiceFlow</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.22em] text-indigo-300">Welcome back</p>
        <h1 className="mt-2 text-3xl font-semibold">Sign in to your workspace</h1>
        <p className="mt-2 text-sm text-slate-400">Aceda à sua conta e continue a gerir o seu negócio.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm text-slate-300">Email
            <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400" placeholder="nome@empresa.com" />
          </label>
          <label className="block text-sm text-slate-300">Palavra-passe
            <input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400" placeholder="A sua palavra-passe" />
          </label>
          {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60">{busy ? "A entrar..." : "Entrar"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">Ainda não tem conta? <Link className="font-medium text-indigo-300 hover:text-indigo-200" href="/register">Criar conta</Link></p>
      </section>
    </main>
  );
}
