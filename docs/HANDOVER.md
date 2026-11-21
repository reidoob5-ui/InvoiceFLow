# Handover guide (for a new owner)

## 1. Accounts you need
- GitHub (the repository), Vercel (hosting), Neon (PostgreSQL), Anthropic (AI assistant, optional), Paddle and/or ProxyPay (billing, optional), an SMTP provider (email, optional).

## 2. Database (Neon)
1. Create a project and copy the **pooled** connection string (`-pooler` host, `sslmode=require`).
2. From a machine with Node 22: `DATABASE_URL="..." npm run db:deploy` then `DATABASE_URL="..." npm run db:seed`.

## 3. Vercel
1. Import the repository. Framework: Next.js. Root directory: repository root.
2. Build command `npm run build`; set **Output Directory** to `apps/web/.next` in the Vercel project settings (the app lives in `apps/web`).
3. Add the environment variables below, then deploy.

## 4. Environment variables
| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled URL |
| `APP_SECRET` | yes | 32+ random characters |
| `APP_URL` | yes | Public https URL of the deployment |
| `ANTHROPIC_API_KEY` | for AI | Without it the assistant shows "unavailable" |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-haiku-5-5` |
| `SMTP_*` | for email | Host, port, user, password, from |
| `PADDLE_*` | for card billing | See `docs/BILLING_SETUP.md` |
| `PROXYPAY_*` | for Multicaixa | Sandbox by default |
| `FISCAL_KEY_ENCRYPTION_KEY` | for AGT | `openssl rand -base64 32`. Encrypts taxpayer RSA keys at rest. Rotating it makes stored keys unreadable: re-enter them |
| `AGT_PRODUCER_PRIVATE_KEY` | for AGT | Producer RSA key (PEM, `\n` escaped). Its public key must be registered with AGT |
| `AGT_PRODUCT_ID`, `AGT_PRODUCT_VERSION`, `AGT_SOFTWARE_VALIDATION_NUMBER` | for AGT | Validation number is issued by AGT |
| `AGT_BASIC_USER`, `AGT_BASIC_PASSWORD` | for AGT | Producer Basic Auth, requested from AGT |
| `AGT_BASE_URL` | no | Overrides the homologation/production URL |

## 5. First-run checklist
1. Open the site, register an account, create a company.
2. Make yourself platform admin: `UPDATE "User" SET "isPlatformAdmin" = true WHERE email = 'you@example.com';` — the **Administração** page appears in the menu.
3. Open `/api/demo` once to create the demo company (it refreshes itself every 21 days).
4. Send a Paddle/ProxyPay test webhook and confirm the subscription changes state.

## 6. What changes hands
Source code, Neon database export, Vercel project, domain (if included), Paddle/ProxyPay configuration, the listing's screenshots and this documentation. Rotate every secret (`APP_SECRET`, database password, API keys) after the transfer.

## 7. Known limits (be upfront with buyers)
- No native mobile apps (responsive web only).
- Recurring invoices, API keys and outgoing webhooks exist in the schema but have no UI yet.
- Typecheck/build run in CI and on Vercel; there is no browser end-to-end suite yet.
- Angolan fiscal certification (e.g. AGT-certified invoicing software) is **not** claimed and must be validated locally before marketing the product as compliant. The AGT module runs in homologation only; see `docs/AGT.md` for the open points.
- The client portal does not take online payments: it shows the company's payment instructions and receives a payment notice that the company confirms.
