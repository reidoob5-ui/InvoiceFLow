import { Sparkles } from "lucide-react";
export default function Loading(){
 return <main className="mx-auto min-h-[65vh] max-w-7xl animate-pulse px-5 py-10 sm:px-8">
  <div className="mb-8 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-400/10 text-indigo-200"><Sparkles size={19}/></span><div><div className="h-3 w-28 rounded bg-white/10"/><div className="mt-3 h-6 w-48 rounded bg-white/10"/></div></div>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map(i=><div key={i} className="h-32 rounded-2xl border border-white/10 bg-white/[.035]"/>)}</div>
  <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]"><div className="h-72 rounded-2xl border border-white/10 bg-white/[.035]"/><div className="h-72 rounded-2xl border border-white/10 bg-white/[.035]"/></div>
 </main>;
}