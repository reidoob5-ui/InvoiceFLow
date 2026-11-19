import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { D, formatMoney } from "@/lib/money";
import { DEMO_EMAIL, DEMO_SLUG } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.user.isPlatformAdmin) redirect("/dashboard");

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const realOrg = { slug: { not: DEMO_SLUG } };

  const [users, newUsers, orgs, subs, recent, aiMonth, invoicesMonth] = await Promise.all([
    prisma.user.count({ where: { email: { not: DEMO_EMAIL } } }),
    prisma.user.count({ where: { email: { not: DEMO_EMAIL }, createdAt: { gte: d30 } } }),
    prisma.organization.count({ where: realOrg }),
    prisma.subscription.findMany({
      where: { organization: realOrg },
      select: { status: true, interval: true, cancelAtPeriodEnd: true, plan: { select: { key: true, name: true, monthlyPrice: true, yearlyPrice: true, currency: true } } },
    }),
    prisma.user.findMany({
      where: { email: { not: DEMO_EMAIL } }, orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, name: true, email: true, createdAt: true, memberships: { take: 1, select: { organization: { select: { name: true, subscription: { select: { status: true, plan: { select: { name: true } } } } } } } } },
    }),
    prisma.aiMessage.count({ where: { role: "user", createdAt: { gte: monthStart }, conversation: { organization: realOrg } } }),
    prisma.invoice.count({ where: { createdAt: { gte: monthStart }, organization: realOrg } }),
  ]);

  const paying = subs.filter(s => s.status === "ACTIVE" && Number(s.plan.monthlyPrice) > 0);
  const currency = paying[0]?.plan.currency || "AOA";
  const mrr = paying.reduce((sum, s) => sum.plus(s.interval === "YEARLY" ? D(s.plan.yearlyPrice).div(12) : D(s.plan.monthlyPrice)), D(0));
  const byPlan = new Map<string, { name: string; active: number; trial: number; pastDue: number }>();
  for (const s of subs) {
    const row = byPlan.get(s.plan.key) ?? { name: s.plan.name, active: 0, trial: 0, pastDue: 0 };
    if (s.status === "ACTIVE") row.active++; else if (s.status === "TRIALING") row.trial++; else if (s.status === "PAST_DUE") row.pastDue++;
    byPlan.set(s.plan.key, row);
  }
  const atRisk = subs.filter(s => s.status === "PAST_DUE" || s.cancelAtPeriodEnd).length;
  const fmt = new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium" });
  const kpis = [
    { label: "Receita mensal recorrente (MRR)", value: formatMoney(mrr, currency, "pt"), hint: `${paying.length} subscrições pagas` },
    { label: "Utilizadores", value: String(users), hint: `+${newUsers} nos últimos 30 dias` },
    { label: "Empresas", value: String(orgs), hint: `${invoicesMonth} facturas este mês` },
    { label: "Em risco", value: String(atRisk), hint: "Em atraso ou a cancelar" },
    { label: "Mensagens de IA", value: String(aiMonth), hint: "Este mês" },
  ];

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-xl font-semibold">Administração da plataforma</h1><p className="mt-1 text-xs text-slate-500">Visível apenas para administradores. A empresa de demonstração não entra nestes números.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{kpis.map(k => <div key={k.label} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-[11px] text-slate-500">{k.label}</p><p className="mt-2 text-xl font-semibold tracking-tight">{k.value}</p><p className="mt-1 text-[10px] text-slate-500">{k.hint}</p></div>)}</div>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold">Subscrições por plano</h2>
        <table className="mt-4 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="pb-2 font-medium">Plano</th><th className="pb-2 font-medium">Activas</th><th className="pb-2 font-medium">Teste</th><th className="pb-2 font-medium">Em atraso</th></tr></thead>
          <tbody>{[...byPlan.values()].map(r => <tr key={r.name} className="border-t border-white/[.06]"><td className="py-2.5 font-medium">{r.name}</td><td>{r.active}</td><td>{r.trial}</td><td className={r.pastDue ? "text-rose-300" : ""}>{r.pastDue}</td></tr>)}
          {byPlan.size === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Ainda sem subscrições.</td></tr>}</tbody></table></section>
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold">Registos recentes</h2>
        <div className="mt-4 space-y-2">{recent.map(u => { const org = u.memberships[0]?.organization; return <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] px-3 py-2.5 text-xs"><div className="min-w-0"><p className="truncate font-medium">{u.name || u.email}</p><p className="truncate text-[10px] text-slate-500">{u.email}{org ? ` · ${org.name}` : ""}</p></div><div className="shrink-0 text-right"><p className="text-slate-300">{org?.subscription?.plan.name ?? "—"}</p><p className="text-[10px] text-slate-500">{fmt.format(u.createdAt)}</p></div></div>; })}
        {recent.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Ainda sem registos.</p>}</div></section>
    </div>
  </div>;
}
