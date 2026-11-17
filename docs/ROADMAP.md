# InvoiceFlow — Product requirements and development roadmap

## Product requirements (approved)

- Product scope: COMPLETE — implement the full business-finance platform, not only invoicing.
- AI: INTEGRATED — AI assistant, document OCR, expense classification, anomaly detection and cash-flow forecasting.
- Platforms: ALL — responsive web, Android and iOS, with desktop/tablet support.
- Business model: multi-tenant SaaS plus dedicated single-tenant deployments.
- Market: global, with localization, currencies and country-specific tax configuration.
- UX: premium, accessible, responsive and multilingual.

## Stage 1 — Foundation
- [x] Next.js / TypeScript application scaffold
- [x] Premium dashboard preview (sample data)
- [x] PostgreSQL / Prisma initial data model
- [ ] Install, compile and validate in the development environment

## Stage 2 — Identity and organizations
- [x] Registration API with input validation
- [x] Password hashing with bcrypt
- [x] Random opaque sessions, hashed at rest, HttpOnly cookie
- [x] Login, logout and current-user endpoints
- [x] Registration and login screens
- [x] Create first organization with OWNER membership
- [x] List organizations for authenticated user
- [x] Create additional organizations for authenticated user
- [x] Membership relation and OWNER / ADMIN / MEMBER roles
- [ ] Password reset and email verification
- [ ] Invitations and role-management interface
- [ ] Rate limiting, abuse protection and security tests
- [ ] Enforce tenant authorization in every business API (required before those APIs ship)
- [ ] Single-tenant bootstrap configuration

## Stage 3 — Business directory
- [ ] Clients CRUD with search and pagination
- [ ] Products and services CRUD
- [ ] Organization profile, address, tax identifiers and logo
- [ ] Currency, locale and tax configuration

## Stage 4 — Invoicing
- [ ] Draft invoices and editable line items
- [ ] Decimal-safe subtotal, tax, discount and total calculations
- [ ] Organization-scoped invoice numbering
- [ ] Issue, void and credit-note workflows
- [ ] Immutable issue-time snapshots
- [ ] Professional PDF generation and download

## Stage 5 — Cash flow
- [ ] Estimates and conversion to invoices
- [ ] Expense tracking
- [ ] Payment ledger and partial payments
- [ ] Due dates, overdue states and reminders

## Stage 6 — Global readiness
- [ ] Translations and locale-aware formatting
- [ ] Multi-currency reporting and exchange-rate strategy
- [ ] Country-specific tax configuration
- [ ] CSV exports and reports

## Stage 7 — AI and automation
- [ ] Provider-independent AI adapter
- [ ] Financial assistant with organization-scoped context
- [ ] OCR and document extraction
- [ ] Expense categorization and anomaly detection
- [ ] Cash-flow forecasts with explainable assumptions and human review

## Stage 8 — SaaS operations and mobile
- [ ] Plans, trials and subscription lifecycle
- [ ] Payment-provider adapters
- [ ] Email-provider adapter and templates
- [ ] Admin tools and audit logs
- [ ] Android and iOS application clients
- [ ] Push notifications and deep links

## Stage 9 — Production readiness
- [ ] Unit, integration, end-to-end and authorization tests
- [ ] Security review and tenant-isolation tests
- [ ] Deployment, backups and restore drills
- [ ] Monitoring, error reporting and operational documentation

> A checked item means the implementation scaffold exists. It does not imply production validation. No production launch before tests and a security review.
