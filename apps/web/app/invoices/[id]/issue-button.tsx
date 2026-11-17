"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function IssueInvoiceButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  async function issue() {
    if (!window.confirm("Confirmas a emissão desta factura? Depois de emitida, os dados financeiros deixam de poder ser editados.")) return;
    setBusy(true);setError("");
    try {
      const response = await fetch(`/api/invoices/${id}/issue`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível emitir.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col items-end gap-2"><button type="button" onClick={issue} disabled={busy} className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy ? "A emitir…" : "Emitir factura"}</button>{error&&<p role="alert" className="max-w-xs text-right text-xs text-rose-300">{error}</p>}</div>;
}
