"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Plus, Copy, Check } from "lucide-react";

type Msg = { id: string; role: string; content: string };
const SUGGESTIONS = [
  "Quanto tenho por receber e quanto está em atraso?",
  "Que clientes devo contactar hoje?",
  "Escreve uma mensagem de cobrança amigável para a factura mais atrasada.",
  "Que contas tenho de pagar nos próximos dias?",
];

export default function AiChat(props: { conversationId: string | null; initial: Msg[]; used: number; limit: number | null; canWrite: boolean; blocked: string | null }) {
  const [messages, setMessages] = useState<Msg[]>(props.initial);
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(props.blocked === "LIMIT_REACHED" ? "Atingiste o limite mensal de mensagens do teu plano." : props.blocked === "SUBSCRIPTION_INACTIVE" ? "A subscrição não está activa." : "");
  const [used, setUsed] = useState(props.used);
  const [copied, setCopied] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  const disabled = loading || !props.canWrite || !!props.blocked;

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setError(""); setLoading(true); setInput("");
    setMessages(m => [...m, { id: "u" + Date.now(), role: "user", content: message }]);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, conversationId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao falar com a IA.");
      setConversationId(data.conversationId);
      setUsed(data.used);
      setMessages(m => [...m, { id: "a" + Date.now(), role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocorreu um erro.");
    } finally { setLoading(false); }
  }
  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard indisponível */ }
  }

  return <div className="mx-auto flex h-[calc(100vh-150px)] max-w-3xl flex-col">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-cyan-400 text-white"><Sparkles size={18}/></span>
        <div><h1 className="text-lg font-semibold">InvoiceFlow AI</h1><p className="text-xs text-slate-500">Responde com os dados reais da tua empresa · só leitura</p></div></div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400">{used}{props.limit === null ? "" : ` / ${props.limit}`} msgs este mês</span>
        <button onClick={() => { setMessages([]); setConversationId(null); setError(""); }} className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"><Plus size={14}/> Nova</button>
      </div>
    </div>
    <div className="flex-1 space-y-4 overflow-y-auto rounded-3xl border border-white/[.08] bg-white/[.02] p-4 sm:p-6">
      {messages.length === 0 && <div className="grid h-full place-content-center gap-3 text-center">
        <p className="text-sm text-slate-400">Pergunta o que quiseres sobre as tuas finanças.</p>
        <div className="grid gap-2 sm:grid-cols-2">{SUGGESTIONS.map(s => <button key={s} disabled={disabled} onClick={() => send(s)} className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-left text-xs text-slate-300 transition hover:border-indigo-300/30 hover:bg-indigo-500/10 disabled:opacity-40">{s}</button>)}</div>
      </div>}
      {messages.map(m => <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
        <div className={`group relative max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === "user" ? "bg-indigo-500/80 text-white" : "border border-white/10 bg-[#111a2b] text-slate-200"}`}>
          {m.content}
          {m.role === "assistant" && <button onClick={() => copy(m.id, m.content)} aria-label="Copiar resposta" className="absolute -bottom-3 right-2 hidden items-center gap-1 rounded-full border border-white/10 bg-[#0b1220] px-2 py-0.5 text-[10px] text-slate-400 hover:text-white group-hover:flex">{copied === m.id ? <Check size={11}/> : <Copy size={11}/>}{copied === m.id ? "Copiado" : "Copiar"}</button>}
        </div></div>)}
      {loading && <div className="flex"><div className="rounded-2xl border border-white/10 bg-[#111a2b] px-4 py-3 text-sm text-slate-400">A analisar os teus dados…</div></div>}
      <div ref={endRef}/>
    </div>
    {error && <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
    <form onSubmit={e => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
      <input value={input} onChange={e => setInput(e.target.value)} maxLength={2000} disabled={disabled} placeholder={props.canWrite ? "Escreve a tua pergunta…" : "O teu perfil só permite ler conversas."}
        className="flex-1 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-indigo-400/50 disabled:opacity-50"/>
      <button disabled={disabled || !input.trim()} aria-label="Enviar" className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white disabled:opacity-40"><Send size={18}/></button>
    </form>
    <p className="mt-2 text-center text-[10px] text-slate-600">A IA pode errar. Confirma sempre valores importantes nos registos.</p>
  </div>;
}
