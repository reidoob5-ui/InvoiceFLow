# InvoiceFlow

Multi-tenant SaaS for small-business finance: invoicing, quotes, expenses, supplier bills, collections, cash-flow insights and an AI assistant that answers from the company's own data. Portuguese-first (Angola/Lusophone market), built to be localised.

**Live demo:** open `/api/demo` on your deployment (read-only demo company with six months of fictional data).

## What is included

| Area | What it does |
| --- | --- |
| Sales | Invoices (draft → issued → paid, immutable snapshots), quotes convertible to invoices, clients, products/services, collections follow-up |
| Purchases | Expenses, supplier bills, suppliers |
| Finance | Taxes, reports, financial insights (overdue/at-risk alerts), business-health planner |
| AI assistant | Chat over the organization's real data (read-only), monthly quota per plan, conversation history |
| Team | Roles (Owner, Admin, Accountant, Sales, Member, Viewer), invitations, 2FA (TOTP), audit log |
| SaaS billing | Plans and subscriptions, Paddle (international) and Multicaixa/ProxyPay (Angola) with a webhook lifecycle |
| Platform admin | `/admin`: MRR, subscriptions per plan, signups, AI usage |
| Public demo | One-click read-only demo company |

The Prisma schema also contains models for recurring invoices, API keys and webhooks that are not yet exposed in the UI.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · Prisma 6 (query compiler + `@prisma/adapter-pg`) · PostgreSQL (Neon works out of the box) · Vercel.

## Quick start (local)

Requirements: Node 22, PostgreSQL 16+.

```bash
npm install
cp .env.example .env.local     # set DATABASE_URL and APP_SECRET (32+ random chars)
npm run db:deploy              # apply committed migrations
npm run db:seed                # create the Free / Pro / Business plans
npm run dev
```

## Deploy on Vercel + Neon (about 20 minutes)

See [`docs/HANDOVER.md`](docs/HANDOVER.md) for the step-by-step guide, required environment variables and the post-deploy checklist.

## Scripts

`npm run dev` · `npm run build` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run db:deploy` · `npm run db:seed`

## Security model

- The active organization is always resolved from the server-side session, never from client input.
- Every protected route checks membership and a `resource:action` permission (`apps/web/lib/permissions.ts`).
- Passwords use scrypt; sessions are stored hashed; login has lockout and per-IP rate limiting; optional TOTP 2FA.
- Issued invoices keep an immutable snapshot. Plan limits are enforced server-side under advisory locks.
- Secrets live in environment variables only.

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/BILLING_SETUP.md`](docs/BILLING_SETUP.md), [`docs/ROADMAP.md`](docs/ROADMAP.md).
