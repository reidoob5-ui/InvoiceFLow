"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[ui]", error.digest ?? "", error.message); }, [error]);
  return <main className="grid min-h-[70vh] place-content-center px-6 text-center">
    <h1 className="text-2xl font-semibold text-white">Algo correu mal</h1>
    <p className="mt-3 max-w-md text-sm text-slate-400">Ocorreu um erro inesperado. Tenta novamente; se continuar, contacta o suporte{error.digest ? ` indicando o código ${error.digest}` : ""}.</p>
    <button onClick={reset} className="mx-auto mt-6 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950">Tentar novamente</button>
  </main>;
}
