# InvoiceFlow

Premium global business-finance platform for invoicing, financial operations and AI-assisted workflows.

## Approved product requirements

- **Scope:** Complete platform covering invoicing, clients, products, expenses, payments, suppliers, cash flow, estimates, reports, tax, teams, administration, subscriptions and integrations.
- **AI:** Integrated assistant, OCR/document extraction, expense classification, anomaly detection and cash-flow forecasting.
- **Platforms:** Responsive web plus Android and iOS clients; desktop and tablet support.
- **Business model:** Multi-tenant SaaS and dedicated single-tenant deployment.
- **Market:** Global, multilingual and multi-currency, with country-specific tax configuration.
- **Experience:** Premium, responsive and accessible.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 · PostgreSQL · bcryptjs

## Current implementation status

### Stage 1 — Foundation
Application scaffold, premium dashboard preview and initial PostgreSQL/Prisma data model. Dashboard figures are sample data.

### Stage 2 — Identity and organizations (implementation in progress)
Registration and login screens; registration/login/logout/current-user APIs; bcrypt password hashing; opaque random sessions stored as SHA-256 hashes and delivered in HttpOnly cookies; first-organization creation with OWNER membership; authenticated organization listing and creation.

**Not yet production-ready:** password reset, email verification, rate limiting, security tests, complete role-management UI, and tenant-protected business CRUD APIs. The new authentication and organization code must be installed, compiled, exercised against PostgreSQL and security-reviewed in the development environment before production use.

## Run in a cloud development environment

Requirements: Node.js 20.9+ and PostgreSQL 16+.

1. Install dependencies: `npm install`
2. Create `.env` from `.env.example` and configure `DATABASE_URL`.
3. Generate Prisma client: `npm run db:generate`
4. Apply the development schema: `npm run db:migrate`
5. Start the app: `npm run dev`
6. Open the forwarded port 3000.

On Android, use GitHub Codespaces in the browser and a hosted PostgreSQL service; local Docker is not required.

## Multi-tenant security principles

- Resolve the active organization from authenticated server-side membership.
- Verify membership and role on every protected operation.
- Never trust organization IDs supplied by the browser without checking membership.
- Scope every business query by the authorized organization ID.
- Keep issue-time invoice details as immutable snapshots.
- Never commit environment files, passwords, API keys or production secrets.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for all approved product requirements and implementation stages.
