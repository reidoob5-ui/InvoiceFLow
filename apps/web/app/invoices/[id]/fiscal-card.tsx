"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Fiscal = { documentNo: string; state: string; deadlineAt: string; errors: string | null } | null;

const STATE_LABEL: Record<string, string> = {
  PENDING: "Na fila de envio", RETRY: "A repetir envio", SUBMITTED: "Enviado, a aguardar validação",
  VALID: "Validado pela AGT", PENALIZED: "Validado com penalização", INVALID: "Rejeitado pela AGT", BLOCKED: "Bloqueado",
};

export default function FiscalCard({ id, fiscal, canCertify, environment }: { id: string; fiscal: Fiscal; canCertify: boolean; environment: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exemption, setExemption] = useState("");

  async function certify() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/invoices/${id}/fiscal`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(exemption.trim() ? { exemptionCode: exemption.trim() } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(data.details) ? ` ${data.details.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join("; ")}` : "";
        throw new Error((data.error || "Não foi possível certificar.") + detail);
      }
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Facturação electrónica AGT</h2>
      <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400">{environment === "PRODUCTION" ? "Produção" : "Homologação"}</span></div>
    {fiscal ? <div className="mt-4 space-y-2 text-sm">
      <p className="font-mono text-base">{fiscal.documentNo}</p>
      <p className={fiscal.state === "VALID" ? "text-emerald-300" : fiscal.state === "INVALID" || fiscal.state === "BLOCKED" ? "text-red-300" : "text-amber-300"}>{STATE_LABEL[fiscal.state] ?? fiscal.state}</p>
      {fiscal.state !== "VALID" && fiscal.state !== "INVALID" && <p className="text-xs text-slate-500">Prazo de envio: {new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(fiscal.deadlineAt))}</p>}
      {fiscal.errors && <p className="text-xs text-red-300">{fiscal.errors}</p>}
    </div> : canCertify ? <div className="mt-4 space-y-3 text-sm">
      <p className="text-slate-400">Gera o documento fiscal assinado, com QR code, e coloca-o na fila de envio à AGT. Não pode ser desfeito.</p>
      <label className="block text-xs text-slate-500">Código de isenção (só se houver linhas a 0% de IVA)
        <input value={exemption} onChange={(e) => setExemption(e.target.value)} maxLength={4} placeholder="ex.: M02" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" /></label>
      <button onClick={certify} disabled={busy} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium disabled:opacity-50">{busy ? "A certificar…" : "Certificar na AGT"}</button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div> : <p className="mt-4 text-sm text-slate-500">Ainda sem documento fiscal.</p>}
  </section>;
}
