# InvoiceFlow

Premium global business-finance SaaS for invoicing, expenses, quotes, cash flow and AI-assisted operations.

## Product direction

- Premium responsive web application; native Android/iOS are a later phase.
- Multi-tenant SaaS and dedicated single-tenant deployments.
- Strict server-side tenant isolation: every protected operation must resolve the organization from the authenticated session and verify membership.
- International-ready currencies, locales, tax configuration and time zones.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 · PostgreSQL.

## Setup

Requirements: Node.js 20.9+ and PostgreSQL 16+.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`; set `DATABASE_URL` and a random `APP_SECRET` (at least 32 characters).
3. Run `npm run db:generate`.
4. Run `npm run db:migrate` to create/apply the development migration.
5. Run `npm run db:seed` to populate Free, Starter, Professional, Business and Enterprise plans.
6. Run `npm run dev`.

On Android, use GitHub Codespaces and a hosted PostgreSQL service; Docker/embedded PostgreSQL are intended for a computer or compatible cloud environment.

## Database commands

- `npm run db:generate`: generate Prisma Client.
- `npm run db:migrate`: create/apply a local development migration.
- `npm run db:deploy`: apply committed migrations in deployment.
- `npm run db:seed`: upsert the default subscription plans.
- `npm run db:studio`: open Prisma Studio.

The Prisma schema is the data model, not a substitute for migrations. Do not deploy until a migration has been generated, reviewed and applied to a real PostgreSQL database.

## Quality

`npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. GitHub Actions runs these checks on implementation branches and pull requests.

## Security requirements

- Never trust an organization ID supplied by the browser.
- Resolve the active organization from a valid server-side session.
- Verify active membership and role on every protected operation.
- Scope every tenant query by the authorized organization ID.
- Keep issued-document snapshots immutable.
- Keep secrets in environment variables; never commit credentials.

## Current implementation status

Core domain libraries and unit tests exist. Database bootstrap, user-facing workflows, tenant-scoped APIs, email delivery, payment integrations, AI workflows and production deployment are still being implemented in stages. A green unit-test run alone does not certify production readiness.
