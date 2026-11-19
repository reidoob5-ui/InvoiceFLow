"use client";

import { useState } from "react";
import { MessageSquare, FilePlus2 } from "lucide-react";
import AiChat from "./ai-chat";
import AiDraft from "./ai-draft";

type ChatProps = React.ComponentProps<typeof AiChat>;

export default function AiWorkspace(props: ChatProps) {
  const [tab, setTab] = useState<"chat" | "draft">("chat");
  const tabs = [{ id: "chat" as const, label: "Conversa", icon: MessageSquare }, { id: "draft" as const, label: "Criar factura", icon: FilePlus2 }];
  return <div>
    <div role="tablist" aria-label="Modo do assistente" className="mx-auto mb-4 flex max-w-3xl gap-2">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${tab === id ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-400/30" : "text-slate-400 hover:bg-white/[.06] hover:text-white"}`}><Icon size={15}/>{label}</button>)}
    </div>
    {tab === "chat" ? <AiChat {...props} /> : <AiDraft canWrite={props.canWrite} />}
  </div>;
}
