import { ArrowDownRight, ArrowUpRight, Bell, CircleHelp, FileText, LayoutDashboard, Plus, Search, Settings2, Users, WalletCards } from "lucide-react";

const invoices = [
  { id: "INV-2026-0148", client: "Northstar Studio", date: "Nov 16, 2026", amount: "$4,850.00", status: "Paid", tone: "green" },
  { id: "INV-2026-0147", client: "Atlas Digital", date: "Nov 15, 2026", amount: "$2,400.00", status: "Pending", tone: "amber" },
  { id: "INV-2026-0146", client: "Morrow & Co.", date: "Nov 13, 2026", amount: "$1,250.00", status: "Overdue", tone: "red" },
  { id: "INV-2026-0145", client: "Vertex Labs", date: "Nov 11, 2026", amount: "$3,600.00", status: "Paid", tone: "green" },
];

const bars = [34, 48, 42, 66, 53, 76, 61, 83, 68, 92, 74, 100];

export default function Home() {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden border-r border-white/10 bg-slate-950/40 p-6 lg:flex lg:flex-col">
        <div className="mb-12 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-lg font-black">I</div>
          <div><div className="text-lg font-semibold tracking-tight">InvoiceFlow</div><div className="text-xs text-slate-500">FINANCE WORKSPACE</div></div>
        </div>
        <div className="mb-3 text-[10px] font-semibold tracking-[.2em] text-slate-500">WORKSPACE</div>
        <nav className="space-y-2 text-sm">
          <a className="flex items-center gap-3 rounded-xl bg-indigo-500/15 px-4 py-3 font-medium text-indigo-200" href="#"><LayoutDashboard size={17}/> Overview</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="#"><FileText size={17}/> Invoices</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="#"><Users size={17}/> Clients</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="#"><WalletCards size={17}/> Expenses</a>
        </nav>
        <div className="mb-3 mt-10 text-[10px] font-semibold tracking-[.2em] text-slate-500">PREFERENCES</div>
        <nav className="space-y-2 text-sm">
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="#"><Settings2 size={17}/> Settings</a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-white/5" href="#"><CircleHelp size={17}/> Help center</a>
        </nav>
        <div className="mt-auto rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4">
          <div className="mb-2 text-sm font-semibold">Your business, clearer.</div>
          <p className="text-xs leading-5 text-slate-400">A single place to manage invoices, clients and cash flow.</p>
          <div className="mt-4 h-1.5 rounded-full bg-white/10"><div className="h-1.5 w-2/3 rounded-full bg-indigo-400"/></div>
          <div className="mt-2 text-[10px] text-slate-500">Workspace preview</div>
        </div>
      </aside>

      <section className="mx-auto w-full max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm text-slate-500">Monday, November 17, 2026</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Good morning, Alex <span>✦</span></h1><p className="mt-2 text-sm text-slate-400">Here&apos;s what&apos;s happening with your business today.</p></div>
          <div className="flex items-center gap-3">
            <button aria-label="Search" className="rounded-xl border border-white/10 p-3 text-slate-400"><Search size={18}/></button>
            <button aria-label="Notifications" className="relative rounded-xl border border-white/10 p-3 text-slate-400"><Bell size={18}/><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-indigo-400"/></button>
            <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-cyan-400 text-sm font-bold text-slate-950">A</div>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Financial overview</h2><p className="mt-1 text-xs text-slate-500">A snapshot of your business performance</p></div><button className="flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-indigo-950/40 hover:bg-indigo-400"><Plus size={16}/> Create invoice</button></div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total revenue", value: "$24,580.00", change: "+12.8%", icon: WalletCards, up: true },
            { label: "Outstanding", value: "$8,240.00", change: "4 invoices", icon: FileText, up: false },
            { label: "Total clients", value: "128", change: "+8 this month", icon: Users, up: true },
            { label: "Paid invoices", value: "86", change: "+6.4%", icon: FileText, up: true },
          ].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-400">{item.label}</span><item.icon size={18} className="text-indigo-300"/></div>
            <div className="mt-5 text-2xl font-semibold tracking-tight">{item.value}</div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">{item.up ? <ArrowUpRight size={14} className="text-emerald-400"/> : <ArrowDownRight size={14} className="text-amber-400"/>}<span>{item.change}</span><span>vs last month</span></div>
          </div>)}
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6">
            <div className="flex items-start justify-between"><div><h3 className="font-semibold">Revenue overview</h3><p className="mt-1 text-xs text-slate-500">Your income performance over the year</p></div><span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400">This year⌄</span></div>
            <div className="mt-8 flex h-48 items-end gap-2 sm:gap-4">{bars.map((height, i) => <div key={i} className="flex h-full flex-1 flex-col justify-end"><div className="w-full rounded-t-md bg-gradient-to-t from-indigo-600/60 to-indigo-400" style={{height: height + "%"}}/><span className="mt-3 text-center text-[10px] text-slate-600">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i]}</span></div>)}</div>
            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5"><div><div className="text-xs text-slate-500">Total revenue</div><div className="mt-1 text-xl font-semibold">$24,580.00</div></div><div className="text-right"><div className="text-xs text-slate-500">Growth</div><div className="mt-1 flex items-center gap-1 text-sm font-medium text-emerald-400"><ArrowUpRight size={15}/>12.8%</div></div></div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 sm:p-6"><h3 className="font-semibold">Quick actions</h3><p className="mt-1 text-xs text-slate-500">Shortcuts to your daily work</p>
            <div className="mt-6 space-y-3">
              {[["Create an invoice","Send a professional invoice to a client",FileText],["Add a new client","Keep your contacts organised",Users],["Record an expense","Track your business spending",WalletCards]].map(([title,desc,Icon]) => <button key={title as string} className="flex w-full items-center gap-3 rounded-xl border border-white/10 p-3 text-left hover:border-indigo-400/40 hover:bg-white/[.03]"><span className="rounded-lg bg-indigo-500/15 p-2.5 text-indigo-300"><Icon size={18}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title as string}</span><span className="mt-1 block text-xs text-slate-500">{desc as string}</span></span><span className="text-slate-500">›</span></button>)}
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/65">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><h3 className="font-semibold">Recent invoices</h3><p className="mt-1 text-xs text-slate-500">Keep track of your latest transactions</p></div><button className="text-xs font-medium text-indigo-300 hover:text-indigo-200">View all invoices →</button></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-white/[.02] text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">Invoice</th><th className="px-5 py-3 font-medium">Client</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Amount</th><th className="px-5 py-3 font-medium">Status</th></tr></thead><tbody>{invoices.map(inv => <tr key={inv.id} className="border-t border-white/[.06]"><td className="px-5 py-4 font-medium text-slate-200">{inv.id}</td><td className="px-5 py-4 text-slate-400">{inv.client}</td><td className="px-5 py-4 text-slate-500">{inv.date}</td><td className="px-5 py-4 font-medium">{inv.amount}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${inv.tone === "green" ? "bg-emerald-400/10 text-emerald-300" : inv.tone === "amber" ? "bg-amber-400/10 text-amber-300" : "bg-rose-400/10 text-rose-300"}`}>{inv.status}</span></td></tr>)}</tbody></table></div>
        </div>
        <p className="mt-8 text-center text-[11px] text-slate-600">InvoiceFlow preview · Sample data only · Secure finance workspace foundation</p>
      </section>
    </main>
  );
}