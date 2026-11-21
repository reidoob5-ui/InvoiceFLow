import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { D, formatMoney } from "@/lib/money";
import { DEMO_EMAIL, DEMO_SLUG } from "@/lib/demo";
import { classifySubscription, getPaySettings, whatsappLink } from "@/lib/billing/manual";
import { HistoryTable, PaymentQueue, SettingsForm, SubscriptionsTable, type HistoryRow, type PendingRow, type SubRow } from "./admin-panels";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.user.isPlatformAdmin) redirect("/dashboard");

  const tabParam = (await searchParams).tab;
  const tab = ["pagamentos", "subscricoes", "historico", "definicoes"].includes(tabParam ?? "") ? tabParam! : "resumo";
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const realOrg = { slug: { not: DEMO_SLUG } };

  const [pendingRaw, historyRaw, orgRows, lastPaid, revenueMonth, plans, settings] = await Promise.all([
    prisma.platformInvoice.findMany({ where: { provider: "manual", status: "OPEN", organization: realOrg }, orderBy: [{ claimedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      include: { targetPlan: { select: { name: true } }, organization: { select: { name: true, phone: true, memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { name: true, email: true } } } } } } } }),
    prisma.platformInvoice.findMany({ where: { provider: "manual", status: { in: ["PAID", "VOID"] }, organization: realOrg }, orderBy: { reviewedAt: "desc" }, take: 100,
      include: { targetPlan: { select: { name: true } }, organization: { select: { name: true } } } }),
    prisma.organization.findMany({ where: realOrg, orderBy: { createdAt: "desc" }, take: 500,
      select: { id: true, name: true, phone: true, createdAt: true, memberships: { where: { role: "OWNER" }, take: 1, select: { user: { select: { name: true, email: true } } } },
        subscription: { select: { status: true, trialEndsAt: true, currentPeriodEnd: true, graceEndsAt: true, plan: { select: { key: true, name: true, monthlyPrice: true } } } } } }),
    prisma.platformInvoice.groupBy({ by: ["organizationId"], where: { status: "PAID" }, _max: { paidAt: true } }),
    prisma.platformInvoice.aggregate({ where: { status: "PAID", currency: "AOA", paidAt: { gte: monthStart }, organization: realOrg }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, name: true } }),
    getPaySettings(),
  ]);
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

  const lastPaidBy = new Map(lastPaid.map((l) => [l.organizationId, l._max.paidAt]));
  const pendingOrgs = new Set(pendingRaw.map((r) => r.organizationId));
  const subRows: SubRow[] = orgRows.map((o) => {
    const sub = o.subscription; const owner = o.memberships[0]?.user;
    return { orgId: o.id, org: o.name, owner: owner?.name || "—", ownerEmail: owner?.email || "—", phone: o.phone || "", plan: sub?.plan.name ?? "Sem plano", planKey: sub?.plan.key ?? "",
      state: classifySubscription(sub, Number(sub?.plan.monthlyPrice ?? 0), now), periodEnd: sub?.currentPeriodEnd?.toISOString() ?? null, trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      lastPaidAt: lastPaidBy.get(o.id)?.toISOString() ?? null, pending: pendingOrgs.has(o.id), createdAt: o.createdAt.toISOString() };
  });
  const money0 = (v: unknown) => new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(Number(v));
  const pending: PendingRow[] = pendingRaw.map((r) => {
    const owner = r.organization.memberships[0]?.user;
    return { id: r.id, reference: r.reference ?? "—", org: r.organization.name, owner: owner?.name || "—", ownerEmail: owner?.email || "—", phone: r.organization.phone || "", plan: r.targetPlan?.name ?? "—", interval: r.billingInterval,
      amount: r.amount.toString(), createdAt: r.createdAt.toISOString(), claimedAt: r.claimedAt?.toISOString() ?? null, note: r.customerNote,
      whatsapp: r.organization.phone ? whatsappLink(r.organization.phone, `Olá! Sobre o seu pagamento do InvoiceFlow (ref. ${r.reference}).`) : null };
  });
  const history: HistoryRow[] = historyRaw.map((r) => ({ id: r.id, reference: r.reference ?? "—", org: r.organization.name, plan: r.targetPlan?.name ?? "—", amount: r.amount.toString(),
    status: r.status as "PAID" | "VOID", at: (r.reviewedAt ?? r.paidAt ?? r.createdAt).toISOString(), periodEnd: r.periodEnd?.toISOString() ?? null, note: r.reviewNote }));
  const unpaidCount = subRows.filter((r) => r.state === "UNPAID" || r.state === "SUSPENDED").length;
  const expiringCount = subRows.filter((r) => r.state === "EXPIRING").length;
  const claimedCount = pending.filter((p) => p.claimedAt).length;
  const kpis = [
    { label: "Receita confirmada este mês", value: money0(revenueMonth._sum.amount ?? 0), hint: `${revenueMonth._count._all} pagamentos confirmados` },
    { label: "A confirmar", value: String(pending.length), hint: `${claimedCount} já avisaram que pagaram` },
    { label: "Não pagaram / expirados", value: String(unpaidCount), hint: `${expiringCount} a expirar em 7 dias` },
    { label: "Receita mensal recorrente (MRR)", value: formatMoney(mrr, currency, "pt"), hint: `${paying.length} subscrições pagas` },
    { label: "Utilizadores", value: String(users), hint: `+${newUsers} nos últimos 30 dias` },
    { label: "Empresas", value: String(orgs), hint: `${invoicesMonth} facturas este mês` },
    { label: "Em risco", value: String(atRisk), hint: "Em atraso ou a cancelar" },
    { label: "Mensagens de IA", value: String(aiMonth), hint: "Este mês" },
  ];

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-xl font-semibold">Administração da plataforma</h1><p className="mt-1 text-xs text-slate-500">Visível apenas para administradores. A empresa de demonstração não entra nestes números.</p></div>
    <nav aria-label="Secções da administração" className="flex flex-wrap gap-1 border-b border-white/10 pb-2 text-sm">{([["resumo", "Resumo"], ["pagamentos", "Pagamentos"], ["subscricoes", "Subscrições"], ["historico", "Histórico"], ["definicoes", "Dados de pagamento"]] as const).map(([id, label]) =>
      <Link key={id} href={id === "resumo" ? "/admin" : `/admin?tab=${id}`} aria-current={tab === id ? "page" : undefined} className={`rounded-lg px-3.5 py-2 font-medium ${tab === id ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5"}`}>{label}{id === "pagamentos" && pending.length > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{pending.length}</span>}</Link>)}</nav>
    {tab === "pagamentos" && <PaymentQueue rows={pending} />}
    {tab === "subscricoes" && <SubscriptionsTable rows={subRows} plans={plans} />}
    {tab === "historico" && <HistoryTable rows={history} />}
    {tab === "definicoes" && <SettingsForm initial={{ pay_bank: settings.pay_bank, pay_holder: settings.pay_holder, pay_iban: settings.pay_iban, pay_express: settings.pay_express, admin_whatsapp: settings.admin_whatsapp, pay_note: settings.pay_note }} />}
    {tab === "resumo" && <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{kpis.map(k => <div key={k.label} className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-[11px] text-slate-500">{k.label}</p><p className="mt-2 text-xl font-semibold tracking-tight">{k.value}</p><p className="mt-1 text-[10px] text-slate-500">{k.hint}</p></div>)}</div>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold">Subscrições por plano</h2>
        <table className="mt-4 w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="pb-2 font-medium">Plano</th><th className="pb-2 font-medium">Activas</th><th className="pb-2 font-medium">Teste</th><th className="pb-2 font-medium">Em atraso</th></tr></thead>
          <tbody>{[...byPlan.values()].map(r => <tr key={r.name} className="border-t border-white/[.06]"><td className="py-2.5 font-medium">{r.name}</td><td>{r.active}</td><td>{r.trial}</td><td className={r.pastDue ? "text-rose-300" : ""}>{r.pastDue}</td></tr>)}
          {byPlan.size === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Ainda sem subscrições.</td></tr>}</tbody></table></section>
      <section className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><h2 className="text-sm font-semibold">Registos recentes</h2>
        <div className="mt-4 space-y-2">{recent.map(u => { const org = u.memberships[0]?.organization; return <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] px-3 py-2.5 text-xs"><div className="min-w-0"><p className="truncate font-medium">{u.name || u.email}</p><p className="truncate text-[10px] text-slate-500">{u.email}{org ? ` · ${org.name}` : ""}</p></div><div className="shrink-0 text-right"><p className="text-slate-300">{org?.subscription?.plan.name ?? "—"}</p><p className="text-[10px] text-slate-500">{fmt.format(u.createdAt)}</p></div></div>; })}
        {recent.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Ainda sem registos.</p>}</div></section>
    </div>
    </>}
  </div>;
}
