"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter(); const [name, setName] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/organizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Não foi possível criar a empresa.");
      router.push("/");
    } catch (err) { setError(err instanceof Error ? err.message : "Erro inesperado."); } finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center px-5 py-12"><form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-[.2em] text-indigo-300">Primeiro passo</p><h1 className="mt-2 text-2xl font-semibold">Vamos configurar a tua empresa</h1><p className="mt-2 mb-8 text-sm text-slate-400">Podes alterar estes dados e convidar a tua equipa mais tarde.</p><label className="mb-2 block text-sm text-slate-300">Nome da empresa</label><input required minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Minha Empresa, Lda." className="mb-5 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-indigo-400"/>{error && <p role="alert" className="mb-4 text-sm text-rose-300">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-50">{busy ? "A configurar…" : "Criar empresa e continuar"}</button></form></main>;
}
