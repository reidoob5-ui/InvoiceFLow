"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { id: string; canSend: boolean; canVoid: boolean; canCredit: boolean };

/** Post-issue actions: email the document, void it (only when unpaid) or correct it with a credit note. */
export default function DocumentActions({ id, canSend, canVoid, canCredit }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(action: "send" | "void" | "credit-note", body?: Record<string, unknown>) {
    setBusy(action); setMessage(null);
    try {
      const response = await fetch(`/api/invoices/${id}/${action}`, {
        method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
      setMessage({ ok: true, text: action === "send" ? "Factura enviada por e-mail." : action === "void" ? "Factura anulada." : `Nota de crédito ${data.creditNote?.number ?? ""} emitida.` });
      router.refresh();
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Erro inesperado." }); }
    finally { setBusy(""); }
  }

  function askReason(question: string) {
    const reason = window.prompt(question)?.trim();
    return reason && reason.length >= 3 ? reason : null;
  }

  const btn = "rounded-xl border border-white/10 px-4 py-3 text-sm disabled:opacity-50";
  return <div className="flex flex-col items-end gap-2">
    <div className="flex flex-wrap justify-end gap-2">
      {canSend && <button type="button" disabled={!!busy} className={btn} onClick={() => { if (window.confirm("Enviar esta factura por e-mail ao cliente?")) void call("send"); }}>{busy === "send" ? "A enviar…" : "Enviar por e-mail"}</button>}
      {canCredit && <button type="button" disabled={!!busy} className={btn} onClick={() => { const reason = askReason("Motivo da nota de crédito (esta acção credita a factura inteira):"); if (reason) void call("credit-note", { reason }); }}>{busy === "credit-note" ? "A emitir…" : "Nota de crédito"}</button>}
      {canVoid && <button type="button" disabled={!!busy} className={`${btn} text-rose-300`} onClick={() => { const reason = askReason("Motivo da anulação (obrigatório). Esta acção não pode ser desfeita:"); if (reason) void call("void", { reason }); }}>{busy === "void" ? "A anular…" : "Anular"}</button>}
    </div>
    {message && <p role={message.ok ? "status" : "alert"} className={`max-w-xs text-right text-xs ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>{message.text}</p>}
  </div>;
}
