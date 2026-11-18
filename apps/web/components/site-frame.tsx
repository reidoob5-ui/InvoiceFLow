"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Menu, X, LayoutDashboard, FileText, FileCheck, Users, Package, Truck,
  ReceiptText, LogOut, ChevronLeft, Sparkles, CreditCard, CircleHelp, WalletCards
} from "lucide-react";

const navigation = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard, description: "O panorama do teu negócio e da actividade financeira.", accent: "from-indigo-400 to-violet-400" },
  { href: "/invoices", label: "Facturas", icon: FileText, description: "Cria documentos, acompanha estados e controla recebimentos.", accent: "from-cyan-400 to-blue-500" },
  { href: "/quotes", label: "Orçamentos", icon: FileCheck, description: "Cria propostas comerciais e converte orçamentos aceites em facturas.", accent: "from-violet-400 to-indigo-500" },
  { href: "/clients", label: "Clientes", icon: Users, description: "Organiza contactos, histórico e relações comerciais.", accent: "from-violet-400 to-fuchsia-500" },
  { href: "/products", label: "Produtos e serviços", icon: Package, description: "Gere o catálogo, preços e serviços da tua empresa.", accent: "from-amber-300 to-orange-500" },
  { href: "/suppliers", label: "Fornecedores", icon: Truck, description: "Mantém fornecedores e parceiros sempre organizados.", accent: "from-emerald-300 to-teal-500" },
  { href: "/expenses", label: "Despesas", icon: ReceiptText, description: "Regista custos e acompanha valores pagos e pendentes.", accent: "from-rose-300 to-pink-500" },
  { href: "/bills", label: "Contas a pagar", icon: WalletCards, description: "Controla facturas de fornecedores, vencimentos e pagamentos.", accent: "from-amber-300 to-yellow-500" },
  { href: "/taxes", label: "Impostos e taxas", icon: ReceiptText, description: "Configura taxas e acompanha os valores aplicáveis.", accent: "from-rose-300 to-pink-500" },
];

const publicPaths = ["/", "/plans", "/login", "/register", "/onboarding"];

export default function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const isPublic = publicPaths.some(path => pathname === path || (path !== "/" && pathname.startsWith(path + "/")));
  if (isPublic) return <>{children}</>;

  async function logout() {
    setSigningOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível terminar a sessão. Tenta novamente.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Falha ao terminar sessão.");
    } finally {
      setSigningOut(false);
    }
  }

  const width = collapsed ? "lg:w-[88px]" : "lg:w-[276px]";
  const offset = collapsed ? "lg:pl-[88px]" : "lg:pl-[276px]";
  const activePage = navigation.find(n => pathname === n.href || pathname.startsWith(n.href + "/"));
  const pageTitle = activePage?.label || "Área de trabalho";

  return (
    <div className="relative min-h-screen overflow-clip bg-[#080d18] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2000&q=80')] bg-cover bg-center opacity-[.055]"/>
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(8,13,24,.97),rgba(8,13,24,.91)_48%,rgba(8,13,24,.97))]"/>
        <div className="absolute -left-44 top-24 h-[420px] w-[420px] rounded-full bg-indigo-600/10 blur-[130px]"/>
        <div className="absolute -right-40 top-[38%] h-[420px] w-[420px] rounded-full bg-cyan-500/[.07] blur-[140px]"/>
        <div className="absolute bottom-0 left-[42%] h-64 w-64 rounded-full bg-violet-600/[.06] blur-[110px]"/>
      </div>

      {mobileOpen && <button aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"/>}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col border-r border-white/[.08] bg-[#0b1220]/95 px-4 py-5 shadow-2xl shadow-black/40 backdrop-blur-2xl transition-all duration-300 ${width} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="mb-10 flex items-center justify-between px-2">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3" onClick={() => setMobileOpen(false)}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 via-violet-500 to-cyan-400 text-xl font-black text-white shadow-lg shadow-indigo-500/25">I</span>
            {!collapsed && <span className="min-w-0"><span className="block text-lg font-bold tracking-tight">InvoiceFlow</span><span className="block text-[9px] font-semibold tracking-[.24em] text-slate-500">FINANCE WORKSPACE</span></span>}
          </Link>
          <button onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 lg:hidden"><X size={18}/></button>
        </div>

        {!collapsed && <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.22em] text-slate-500">Espaço de trabalho</p>}
        <nav aria-label="Navegação principal" className="flex-1 space-y-1.5">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return <Link key={href} href={href} onClick={() => setMobileOpen(false)} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 ${active ? "bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-indigo-200 ring-1 ring-indigo-400/20 shadow-lg shadow-indigo-950/20" : "text-slate-400 hover:bg-white/[.06] hover:text-white"}`}>
              <Icon size={19} strokeWidth={1.8} className={`transition-all duration-300 group-hover:-translate-y-0.5 group-hover:scale-110 ${active ? "text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,.65)]" : "text-slate-500 group-hover:text-slate-200"}`}/>
              {!collapsed && <span>{label}</span>}
              {active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_10px_#a5b4fc]"/>}
            </Link>;
          })}
        </nav>

        {!collapsed && <div className="mb-4 rounded-2xl border border-indigo-400/15 bg-gradient-to-br from-indigo-500/10 to-cyan-500/[.04] p-4">
          <div className="mb-2 flex items-center gap-2 text-indigo-200"><Sparkles size={15}/><span className="text-xs font-semibold">InvoiceFlow AI</span><span className="ml-auto rounded-full border border-indigo-300/20 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-indigo-200">Em breve</span></div>
          <p className="text-[11px] leading-5 text-slate-400">Uma experiência financeira mais clara, com ferramentas inteligentes a caminho.</p>
          <Link href="/plans" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-300 hover:text-white">Conhecer os planos <CreditCard size={12}/></Link>
        </div>}

        <div className="border-t border-white/[.08] pt-4">
          {!collapsed && <div className="mb-3 flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold text-slate-200">IF</span>
            <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-200">A tua conta</span><span className="block text-[10px] text-slate-500">Sessão protegida</span></span>
          </div>}
          {logoutError && !collapsed && <p role="alert" className="mb-2 rounded-lg bg-rose-500/10 p-2 text-[10px] text-rose-300">{logoutError}</p>}
          <button onClick={logout} disabled={signingOut} title={collapsed ? "Terminar sessão" : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50">
            <LogOut size={18}/>{!collapsed && (signingOut ? "A sair..." : "Terminar sessão")}
          </button>
          <Link href="/plans" title={collapsed ? "Planos e subscrição" : undefined} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-white/[.06] hover:text-white">
            <CircleHelp size={18}/>{!collapsed && "Planos e ajuda"}
          </Link>
          <button onClick={() => setCollapsed(!collapsed)} className="mt-2 hidden w-full items-center justify-center rounded-xl py-2 text-slate-500 transition hover:bg-white/[.06] hover:text-white lg:flex" aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
            {collapsed ? <Menu size={17}/> : <ChevronLeft size={17}/>}
          </button>
        </div>
      </aside>

      <div className={`relative z-10 min-h-screen transition-[padding] duration-300 ${offset}`}>
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/[.07] bg-[#080d18]/80 px-4 backdrop-blur-2xl sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileOpen(true)} aria-label="Abrir menu" aria-expanded={mobileOpen} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-slate-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/10">
              <Menu size={20}/>
            </button>
            <span className={`service-icon-orbit grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${activePage?.accent || "from-indigo-400 to-violet-500"} p-[1px] shadow-lg shadow-indigo-950/30`}>
              <span className="grid h-full w-full place-items-center rounded-[15px] bg-[#111a2b] text-white"><>{activePage ? <activePage.icon size={18} strokeWidth={1.9}/> : <Sparkles size={18}/>}</></span>
            </span>
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">InvoiceFlow · Espaço de trabalho</p><p className="truncate text-sm font-semibold text-slate-100">{pageTitle}</p><p className="hidden max-w-[520px] truncate text-[10px] text-slate-500 sm:block">{activePage?.description || "As ferramentas do teu negócio, sempre à mão."}</p></div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[.06] px-3 py-1.5 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"/><span className="text-[10px] font-medium text-emerald-200">Workspace activo</span></div>
        </header>
        <div className="animate-[page-enter_.42s_ease-out_both] px-4 pb-12 pt-5 sm:px-7 lg:px-9">{children}</div>
      </div>
    </div>
  );
}