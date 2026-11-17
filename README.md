# InvoiceFlow

Premium invoicing and business-finance workspace, designed for a global market.

## Product direction

- Premium user experience
- One codebase for multi-tenant SaaS and dedicated single-tenant deployments
- International-ready data model (organization currency and timezone)
- Strict server-side tenant isolation as a non-negotiable security requirement

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 · PostgreSQL

## Current status — Stage 1 foundation

This repository currently contains the application foundation and a dashboard preview with sample data. The dashboard is not connected to a database yet. Authentication, tenant authorization, CRUD workflows, invoice issuance, PDF generation, email delivery, payment processing, and production deployment are not implemented.

## Run locally

Requirements: Node.js 20.9+ and PostgreSQL 16+.

1. Install dependencies: `npm install`
2. Create local environment file: copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Generate Prisma client: `npm run db:generate`
4. Create the database migration: `npm run db:migrate`
5. Start development server: `npm run dev`
6. Open `http://localhost:3000`.

If you use Docker on a computer, start PostgreSQL with `docker compose up -d db` before running the Prisma commands. On Android, use a cloud development environment such as GitHub Codespaces and a hosted PostgreSQL service instead of trying to run Docker locally.

## Environment variables

See `.env.example`. Never commit `.env`, passwords, API keys, or production secrets.

## Multi-tenant security principles

- Resolve the active organization from the authenticated server-side session.
- Verify membership and role on every protected server operation.
- Never trust an organization ID supplied by the browser.
- Scope every database query by the authorized organization ID.
- Keep invoice line descriptions, prices, tax rates, and totals as immutable issue-time snapshots in the invoicing stage.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).
