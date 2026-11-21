"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function LockButton() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  return <button disabled={busy} onClick={async () => { setBusy(true); try { await fetch("/api/admin/vault/lock", { method: "POST" }); } finally { router.replace("/admin/unlock"); router.refresh(); } }}
    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50"><Lock size={13} /> Bloquear agora</button>;
}
