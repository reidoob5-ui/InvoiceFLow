"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, AlertTriangle, Info, CheckCircle2, ShieldAlert, Lightbulb, ArrowRight } from "lucide-react";

type Signal = { id: string; severity: "critical" | "warning" | "info" | "good"; title: string; detail: string; href?: string; ask?: string };
type Msg = { id: string; role: "user" | "assistant"; content: string };

const STORE_SEEN = "if-assistant-seen";
const STORE_DISMISSED = "if-assistant-dismissed";
const readSet = (k: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch { return new Set(); } };
const writeSet = (k: string, v: Set<string>) => { try { localStorage.setItem(k, JSON.stringify([...v].slice(-200))); } catch { /* sem armazenamento */ } };

const STYLE = {
  critical: { icon: ShieldAlert, ring: "border-rose-400/30 bg-rose-500/10", text: "text-rose-300" },
  warning: { icon: AlertTriangle, ring: "border-amber-300/30 bg-amber-400/10", text: "text-amber-300" },
  info: { icon: Info, ring: "border-sky-300/25 bg-sky-400/10", text: "text-sky-300" },
  good: { icon: CheckCircle2, ring: "border-emerald-300/25 bg-emerald-400/10", text: "text-emerald-300" },
} as const;

const IMPROVE = "Analisa o meu negócio como contabilista e secretária: o que está a correr bem, o que está a correr mal e que 3 melhorias devo fazer primeiro esta semana?";

export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"alerts" | "chat">("alerts");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [canChat, setCanChat] = useState(true);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastFetch = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSeen(readSet(STORE_SEEN)); setDismissed(readSet(STORE_DISMISSED)); }, []);

  const refresh = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch.current < 60_000) return;
    lastFetch.current = Date.now();
    try {
      const res = await fetch("/api/assistant/signals", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSignals(Array.isArray(data.signals) ? data.signals : []);
      setCanChat(data.canChat !== false);
      setLoaded(true);
    } catch { /* sem rede: tenta de novo mais tarde */ }
  }, []);

  useEffect(() => { refresh(); }, [pathname, refresh]);
  useEffect(() => { const t = setInterval(() => refresh(true), 5 * 60_000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, tab, open]);

  const visible = signals.filter((s) => !dismissed.has(s.id));
  const unseenAttention = visible.filter((s) => s.severity !== "good" && !seen.has(s.id));
  const hasCritical = unseenAttention.some((s) => s.severity === "critical");

  function openPanel() {
    setOpen(true);
    refresh(true);
    const next = new Set(seen); visible.forEach((s) => next.add(s.id)); setSeen(next); writeSet(STORE_SEEN, next);
  }
  function dismiss(id: string) { const next = new Set(dismissed); next.add(id); setDismissed(next); writeSet(STORE_DISMISSED, next); }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setTab("chat"); setError(""); setBusy(true); setInput("");
    setMessages((m) => [...m, { id: "u" + Date.now(), role: "user", content: message }]);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, conversationId, page: pathname }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao falar com o assistente.");
      setConversationId(data.conversationId);
      setMessages((m) => [...m, { id: "a" + Date.now(), role: "assistant", content: data.reply }]);
    } catch (e) { setError(e instanceof Error ? e.message : "Ocorreu um erro."); }
    finally { setBusy(false); }
  }

  if (!loaded && !open) return null;
  if (pathname === "/ai" || pathname.startsWith("/ai/")) return null;

  return <>
    {!open && <button onClick={openPanel} aria-label={unseenAttention.length ? `Assistente: ${unseenAttention.length} novos avisos` : "Abrir assistente"}
      className="fixed bottom-5 right-5 z-[60] grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-indigo-400 via-violet-500 to-cyan-400 text-white shadow-xl shadow-indigo-900/50 transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
      {hasCritical && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-rose-400/40" />}
      <Sparkles size={24} />
      {unseenAttention.length > 0 && <span className={`absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11px] font-bold text-white ring-2 ring-[#080d18] ${hasCritical ? "bg-rose-500" : "bg-amber-500"}`}>{unseenAttention.length}</span>}
    </button>}

    {open && <>
      <button aria-label="Fechar assistente" onClick={() => setOpen(false)} className="fixed inset-0 z-[60] bg-black/40 sm:hidden" />
      <aside role="dialog" aria-label="Assistente InvoiceFlow" className="fixed inset-x-0 bottom-0 z-[61] flex h-[85vh] flex-col rounded-t-3xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/60 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[640px] sm:max-h-[calc(100vh-40px)] sm:w-[400px] sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/[.08] px-4 py-3">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-cyan-400 text-white"><Sparkles size={17} /></span>
            <div><p className="text-sm font-semibold">Assistente InvoiceFlow</p><p className="text-[11px] text-slate-500">Contabilista e secretário do teu negócio</p></div></div>
          <button onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="flex gap-1 border-b border-white/[.08] p-2 text-xs font-medium">
          <button onClick={() => setTab("alerts")} className={`flex-1 rounded-lg px-3 py-2 ${tab === "alerts" ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5"}`}>Para ti{visible.filter((s) => s.severity !== "good").length > 0 && <span className="ml-1.5 rounded-full bg-rose-500/80 px-1.5 text-[10px] text-white">{visible.filter((s) => s.severity !== "good").length}</span>}</button>
          <button onClick={() => setTab("chat")} className={`flex-1 rounded-lg px-3 py-2 ${tab === "chat" ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5"}`}>Conversa</button>
        </div>

        {tab === "alerts" ? <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {visible.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nada de novo por agora. Eu aviso-te quando algo precisar de atenção.</p>}
          {visible.map((s) => { const st = STYLE[s.severity]; const Icon = st.icon; return <article key={s.id} className={`rounded-2xl border p-3.5 ${st.ring}`}>
            <div className="flex items-start gap-2.5"><Icon size={17} className={`mt-0.5 shrink-0 ${st.text}`} />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-100">{s.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-300">{s.detail}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {s.href && <Link href={s.href} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-white/20">Ver <ArrowRight size={12} /></Link>}
                  {s.ask && canChat && <button onClick={() => send(s.ask!)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/10">Explica-me e ajuda</button>}
                </div></div>
              <button onClick={() => dismiss(s.id)} aria-label="Dispensar" className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-slate-300"><X size={14} /></button></div>
          </article>; })}
          {canChat && <button onClick={() => send(IMPROVE)} className="flex w-full items-center gap-2 rounded-2xl border border-indigo-300/20 bg-indigo-500/10 p-3.5 text-left text-xs text-indigo-100 hover:bg-indigo-500/20"><Lightbulb size={16} className="shrink-0" /> Pede-me um plano de melhorias para o teu negócio</button>}
        </div> : <>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{canChat ? "Pergunta o que quiseres sobre o teu negócio." : "O teu perfil só permite ver os avisos."}</p>}
            {messages.map((m) => <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-indigo-500 text-white" : "bg-white/[.06] text-slate-100"}`}>{m.content}</div></div>)}
            {busy && <div className="flex justify-start"><div className="rounded-2xl bg-white/[.06] px-3.5 py-2.5 text-sm text-slate-400">A pensar…</div></div>}
            {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-2.5 text-xs text-rose-300">{error}</p>}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t border-white/[.08] p-3">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} rows={1} maxLength={2000} disabled={!canChat || busy}
              placeholder={canChat ? "Escreve a tua dúvida…" : "Sem permissão para conversar"} className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 disabled:opacity-50" />
            <button type="submit" disabled={!canChat || busy || !input.trim()} aria-label="Enviar" className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-indigo-500 text-white disabled:opacity-40"><Send size={17} /></button>
          </form>
        </>}
      </aside>
    </>}
  </>;
}
