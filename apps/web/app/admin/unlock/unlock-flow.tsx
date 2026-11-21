"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { qrMatrix } from "@/lib/agt/qr-encode";

type Props = { loggedIn: boolean; email: string; twoFactorEnabled: boolean; twoFactorRequired: boolean; hasPassword: boolean; envManaged: boolean };

function QrSvg({ text }: { text: string }) {
  const m = qrMatrix(text); const n = m.length; const q = 4;
  const cells: string[] = [];
  m.forEach((row, y) => row.forEach((on, x) => { if (on) cells.push(`M${x + q},${y + q}h1v1h-1z`); }));
  return <svg viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} role="img" aria-label="Código QR para a aplicação de autenticação" className="h-48 w-48 rounded-xl bg-white"><path d={cells.join("")} fill="#000" /></svg>;
}

const input = "mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-600";
const primary = "w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50";

export default function UnlockFlow({ loggedIn, email, twoFactorEnabled, twoFactorRequired, hasPassword, envManaged }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mail, setMail] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [token, setToken] = useState("");
  // O token vem no fragmento (#setup=...): nunca chega ao servidor nem aos registos.
  useEffect(() => { const m = /[#&]setup=([A-Za-z0-9_-]{20,200})/.exec(window.location.hash); if (m) { setToken(m[1]); history.replaceState(null, "", window.location.pathname); } }, []);
  const [needsCode, setNeedsCode] = useState(false);
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [code, setCode] = useState("");
  const [secret, setSecret] = useState<{ secret: string; url: string } | null>(null);

  async function post(url: string, body: unknown) {
    setBusy(true); setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { if (data.code === "CODE_REQUIRED") setNeedsCode(true); setError(data.error || "Não foi possível concluir."); return false; }
      return data;
    } catch { setError("Sem ligação. Tenta novamente."); return false; }
    finally { setBusy(false); }
  }

  const needs2fa = twoFactorRequired && !twoFactorEnabled;
  let title = "Área reservada"; let intro = "Esta área só abre com a senha própria do administrador."; let body: React.ReactNode;

  if (needs2fa) {
    title = "Passo 1 — Autenticação em duas etapas"; intro = "Antes de criar a senha do admin, liga o 2FA com uma aplicação (Google Authenticator, Microsoft Authenticator, Authy). Depois, mesmo que alguém descubra as tuas senhas, não entra sem o telemóvel.";
    body = !secret ? <button className={primary} disabled={busy} onClick={async () => { const d = await post("/api/auth/2fa/setup", {}); if (d) setSecret({ secret: d.secret, url: d.otpauthUrl }); }}><Smartphone className="mr-2 inline" size={16} />Gerar código QR</button>
      : <form onSubmit={async (e) => { e.preventDefault(); if (await post("/api/auth/2fa/verify", { code })) router.refresh(); }} className="space-y-4">
        <div className="flex flex-col items-center gap-3"><QrSvg text={secret.url} /><p className="text-center text-[11px] text-slate-400">Lê o QR na aplicação. Se não conseguires, escreve esta chave: <span className="break-all font-mono text-slate-200">{secret.secret}</span></p></div>
        <label className="block text-xs text-slate-400">Código de 6 dígitos da aplicação<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={input} /></label>
        <button className={primary} disabled={busy || code.length !== 6}>Confirmar e activar 2FA</button></form>;
  } else if (!loggedIn && !hasPassword && token) {
    title = "Primeiro acesso — cria a tua senha"; intro = "Escreve o teu email de administrador e escolhe a senha do admin (mínimo 14 caracteres ou uma frase longa). Este link só funciona uma vez. Depois, para entrares, bastam este email e esta senha.";
    body = <form onSubmit={async (e) => { e.preventDefault(); const r = await post("/api/admin/vault/claim", { token, email: mail, password, confirm: confirmPw }); if (r) { router.replace("/admin"); router.refresh(); } }} className="space-y-4">
      <label className="block text-xs text-slate-400">O teu email de administrador<input type="email" autoComplete="username" value={mail} onChange={(e) => setMail(e.target.value)} autoFocus className={input} /></label>
      <label className="block text-xs text-slate-400">Cria a senha do admin<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></label>
      <label className="block text-xs text-slate-400">Repete a senha<input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={input} /></label>
      <button className={primary} disabled={busy || !mail || !password || !confirmPw}>Criar senha e entrar</button></form>;
  } else if (!loggedIn) {
    title = "Administração"; intro = hasPassword ? "Entra com o teu email e a senha do admin." : "Ainda não há senha do admin. Abre o link de primeiro acesso que recebeste.";
    body = hasPassword ? <form onSubmit={async (e) => { e.preventDefault(); const r = await post("/api/admin/vault/login", { email: mail, password, code }); if (r) { router.replace("/admin"); router.refresh(); } }} className="space-y-4">
      <label className="block text-xs text-slate-400">Email<input type="email" autoComplete="username" value={mail} onChange={(e) => setMail(e.target.value)} autoFocus className={input} /></label>
      <label className="block text-xs text-slate-400">Senha do admin<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></label>
      {needsCode && <label className="block text-xs text-slate-400">Código de autenticação<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={input} /></label>}
      <button className={primary} disabled={busy || !mail || !password}>Entrar</button></form>
      : <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-400">Sem o link de primeiro acesso não é possível criar a senha. Pede um novo link.</p>;
  } else if (!hasPassword) {
    title = "Cria a senha do admin"; intro = "Escolhe uma senha ou frase só tua, diferente da senha da tua conta. Depois, para entrares aqui, bastam o teu email e esta senha. Guarda-a num sítio seguro: não há forma de a recuperar sem acesso à base de dados.";
    body = <form onSubmit={async (e) => { e.preventDefault(); if (await post("/api/admin/vault/setup", { password, confirm, code })) router.replace("/admin"); }} className="space-y-4">
      <label className="block text-xs text-slate-400">Senha do admin (mín. 14 caracteres)<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></label>
      <label className="block text-xs text-slate-400">Repete a senha<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} /></label>
      {twoFactorEnabled && <label className="block text-xs text-slate-400">Código 2FA<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={input} /></label>}
      <button className={primary} disabled={busy || !password || (twoFactorEnabled && code.length !== 6)}>Guardar e entrar</button></form>;
  } else {
    body = <form onSubmit={async (e) => { e.preventDefault(); if (await post("/api/admin/vault/unlock", { password, code })) router.replace("/admin"); }} className="space-y-4">
      <label className="block text-xs text-slate-400">Senha do admin<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus className={input} /></label>
      {twoFactorEnabled && <label className="block text-xs text-slate-400">Código 2FA<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={input} /></label>}
      <button className={primary} disabled={busy || !password || (twoFactorEnabled && code.length !== 6)}>Abrir administração</button>
      {envManaged && <p className="text-[11px] text-slate-500">A senha está definida na Vercel (ADMIN_ACCESS_HASH).</p>}</form>;
  }

  return <div className="mx-auto flex min-h-[70vh] max-w-md items-center"><div className="w-full rounded-3xl border border-white/10 bg-white/[.03] p-6 sm:p-8">
    <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-400/15 text-rose-300">{needs2fa ? <ShieldCheck size={22} /> : <KeyRound size={22} />}</span><div><h1 className="text-lg font-semibold text-white">{title}</h1><p className="text-[11px] text-slate-500">{email || "Área reservada"}</p></div></div>
    <p className="mt-4 text-xs leading-relaxed text-slate-400">{intro}</p>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
    <div className="mt-5">{body}</div>
    <p className="mt-5 text-[11px] text-slate-600">Fecha sozinha após 15 min sem actividade. Todas as tentativas ficam registadas.</p>
  </div></div>;
}
