# InvoiceFlow — Development roadmap

## Stage 1 — Foundation
- [x] Next.js / TypeScript application scaffold
- [x] Premium dashboard preview (sample data)
- [x] PostgreSQL / Prisma initial data model
- [ ] Install, compile and validate in the development environment

## Stage 2 — Identity and organizations
- [ ] Registration, login, logout and password reset
- [ ] Secure password hashing and session handling
- [ ] User profiles
- [ ] Organization creation and onboarding
- [ ] Membership and roles: owner, admin, member
- [ ] Server-side tenant isolation on every protected query
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

## Stage 7 — SaaS operations
- [ ] Plans, trials and subscription lifecycle
- [ ] Payment-provider adapters
- [ ] Email-provider adapter and templates
- [ ] Admin tools and audit logs

## Stage 8 — Production readiness
- [ ] Unit, integration and end-to-end tests
- [ ] Security review and authorization tests
- [ ] Deployment, backups and restore drills
- [ ] Monitoring, error reporting and operational documentation

> A checked item means the file or scaffold exists; it does not imply production validation.