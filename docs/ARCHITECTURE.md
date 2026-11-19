# Architecture

```
apps/web                Next.js app (pages, API routes, components)
  app/                  Routes: marketing, auth, dashboard modules, /api/*
  lib/                  Domain logic: auth, permissions, plans, billing, AI, invoices, money
  lib/ai/               Anthropic client + read-only financial context builder
prisma/                 schema.prisma and SQL migrations (applied with `prisma migrate deploy`)
scripts/                seed.ts (plans)
docs/                   Handover, billing setup, roadmap
```

## Request flow
1. `getCurrentSession()` reads the session cookie, loads the user and the **active membership**.
2. Handlers call `assertCan(role, "resource:action")`; the organization id always comes from the membership.
3. Prisma queries are scoped by `organizationId`. Money uses `decimal.js` (`lib/money.ts`).
4. Plan-limited writes go through `withOrganizationPlanLimit` (advisory lock) and critical transactions use `retryOnConflict` for serialization failures.

## AI assistant
`/api/ai/chat` → quota check (`checkAiQuota`) → `buildFinancialContext` (read-only aggregate text) → Anthropic Messages API → persisted in `AiConversation`/`AiMessage`. The model can only read; the system prompt treats company data as information, not instructions.

## Demo
`/api/demo` creates (once) a company with a `VIEWER` member filled with deterministic fictional data and opens a session. `VIEWER` has read-only permissions, so every write endpoint rejects it.

## Billing
Plans live in the `Plan` table (seeded from `lib/plans.ts`). Paddle and ProxyPay webhooks update `Subscription` with idempotent event handling (`ProviderWebhookEvent`).
