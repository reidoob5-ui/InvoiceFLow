# InvoiceFlow billing providers

InvoiceFlow supports two independent payment rails. Both remain disabled until merchant credentials and production onboarding are complete.

## 1. Angola — MULTICAIXA Express / EMIS through ProxyPay

The integration uses the ProxyPay OPG API to create a dynamic EMIS charge. Customers scan the returned QR code or open the MULTICAIXA Express deep link. InvoiceFlow does not activate a plan from the browser redirect or an unverified callback: the webhook fetches the transaction from ProxyPay and checks the merchant POS, transaction ID, charge ID, status, and exact amount before marking the platform invoice paid.

### Merchant onboarding

1. Ask the bank where InvoiceFlow's business account is domiciled to onboard the business for EMIS GPO / online payments, or complete ProxyPay merchant onboarding.
2. Obtain the ProxyPay API token and the EMIS POS_ID assigned to the merchant.
3. Confirm the merchant is approved for the required production channel and that the callback URL is accepted.
4. Add these secrets to the production hosting environment (never commit them):
   - PROXYPAY_ENV=sandbox for tests, production only after approval.
   - PROXYPAY_API_TOKEN
   - PROXYPAY_POS_ID
   - APP_URL set to the public HTTPS InvoiceFlow origin.
5. Test with the ProxyPay sandbox before requesting production activation.

Endpoint: POST /api/billing/checkout/multicaixa with JSON { "planKey": "pro", "interval": "MONTHLY" }.

Webhook callback: POST /api/webhooks/proxypay.

## 2. International — Paddle Billing

Paddle is used as merchant of record for international SaaS subscriptions. Paddle hosts checkout, processes payment methods available to the buyer, manages recurring billing, and handles applicable sales taxes for transactions processed through Paddle. Paddle issues the buyer's payment invoice/receipt for those transactions.

### Merchant and catalog setup

1. Create a Paddle account and complete business verification.
2. Create recurring products/prices for each paid InvoiceFlow plan and interval: Pro monthly/yearly and Business monthly/yearly.
3. Use Paddle sandbox first. Copy the four price IDs into the environment variables below.
4. Create a Paddle notification destination for https://YOUR_DOMAIN/api/webhooks/paddle and subscribe to at least:
   - transaction.completed
   - subscription.updated
   - subscription.canceled
5. Copy the notification destination secret into PADDLE_WEBHOOK_SECRET.
6. Only switch PADDLE_ENV to production after Paddle approves the merchant and the live catalog/webhook are verified.

Required environment variables:
- PADDLE_ENV=sandbox or production
- PADDLE_API_KEY
- PADDLE_WEBHOOK_SECRET
- PADDLE_PRICE_PRO_MONTHLY
- PADDLE_PRICE_PRO_YEARLY
- PADDLE_PRICE_BUSINESS_MONTHLY
- PADDLE_PRICE_BUSINESS_YEARLY

Endpoint: POST /api/billing/checkout/international with JSON { "planKey": "pro", "interval": "MONTHLY" }.

Webhook callback: POST /api/webhooks/paddle. It verifies the Paddle signature, enforces the configured price ID, and activates/updates a subscription only on a completed recurring transaction. Repeated webhook event IDs are rejected idempotently.

## Important launch controls

- Never place provider secrets in browser code, source control, or client-visible environment variables.
- Keep both providers in sandbox until merchant approval, test transactions, callback delivery, and refund procedures are verified.
- Local EMIS invoices are reconciled against the provider transaction API before activation.
- Paddle is the merchant of record for international subscriptions; do not also collect the same international subscription through EMIS.
- The local plan catalogue remains denominated in AOA. Paddle live price IDs and checkout currency must match the prices actually approved in the Paddle dashboard; the checkout provider, not browser locale, determines the final charge.
- A provider being configured in environment variables is not proof that the merchant account has been approved for production.
