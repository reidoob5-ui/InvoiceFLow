# InvoiceFlow — Technical architecture

## Product architecture

InvoiceFlow is one product with two deployment modes:
- **SaaS multi-tenant:** multiple organizations share the application and database while every business record is scoped to an organization.
- **Dedicated deployment:** one customer receives an isolated installation and database. A deployment setting selects the mode; it must not weaken authorization.

## Application surfaces

- `apps/web`: Next.js responsive web application and server-side API.
- `apps/mobile` (planned): Expo + React Native client for Android and iOS.
- Shared TypeScript contracts and validation schemas should move into a shared package when the mobile client is introduced.
- The web experience must remain usable on desktop, tablet and mobile browsers.

## Core services

- PostgreSQL is the source of truth.
- Prisma provides typed data access and migrations.
- Authentication uses opaque random session tokens. Only token hashes are stored in the database; browser cookies are HttpOnly, SameSite=Lax and Secure in production.
- Authorization is based on database membership and role, never on a role or organization ID trusted from the client.
- External services (email, payments, storage, AI, exchange rates) are accessed through provider adapters so vendors can be replaced.

## Tenant isolation requirements

1. Every tenant-owned table includes an organization relation or a verifiable path to one.
2. Every read, update and delete scopes the query by an organization the authenticated user belongs to.
3. Every create operation derives its organization from a verified membership, not an arbitrary client-supplied ID.
4. Cross-tenant references are rejected (for example, an invoice cannot use a client from another organization).
5. Authorization tests must attempt cross-tenant access for every business API before launch.
6. Audit sensitive actions and avoid exposing secrets or full payment credentials in logs.

## AI architecture

- Use a provider-independent AI service layer; do not couple business logic to one model vendor.
- Pass only the minimum organization-scoped data required for a task.
- Treat OCR and model output as untrusted suggestions. Validate extracted values and require human confirmation before issuing invoices, changing accounting records or initiating payments.
- Financial forecasts must show assumptions and uncertainty; AI must not silently alter financial records.
- Record model/provider, task type, timestamp and user confirmation where appropriate, without logging unnecessary personal or financial data.

## International requirements

- Store money as fixed-precision decimal values, never binary floating point.
- Store transaction currency and relevant exchange-rate snapshots.
- Store timestamps in UTC and render them using the organization's timezone.
- Keep tax rules configurable by country and effective date. Do not claim legal/fiscal compliance until country-specific validation is complete.
- Localize labels, dates, numbers and currencies; do not infer tax treatment from display locale alone.

## Security and release gates

- Add rate limiting and abuse protection to authentication endpoints.
- Implement email verification and secure password reset.
- Enforce origin/CSRF protections for state-changing requests.
- Add audit events, session revocation and account recovery.
- Run dependency, static, unit, integration, end-to-end and tenant-isolation tests.
- Complete a security review, backup/restore drill and operational monitoring before production.
