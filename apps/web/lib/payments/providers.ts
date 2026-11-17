import { verifyWebhookSignature } from "../auth/tokens";

// Payment-provider adapter contract. Concrete providers (Stripe, local mobile-money/ATM-reference gateways,
// etc.) implement `parseWebhook`; the platform never trusts an event until its signature is verified.
export type ProviderEvent = {
  provider: string;
  /** Provider's unique transaction id — used for idempotency (unique with `provider` in the Payment table). */
  providerRef: string;
  status: "succeeded" | "failed" | "refunded";
  amount: string;
  currency: string;
  /** Our invoice id or number carried in the provider metadata. */
  invoiceRef?: string;
  organizationId?: string;
};

export interface PaymentProvider {
  id: string;
  /** Verify the signature and parse the body. Must throw or return null for anything not authentic. */
  parseWebhook(rawBody: string, headers: Headers, secret: string): ProviderEvent | null;
}

/**
 * Generic HMAC-signed provider ("invoiceflow" format). Useful for custom gateways, bank-reference
 * integrations and for testing: the gateway signs `${t}.${body}` with the shared secret and sends
 * the result in the `x-invoiceflow-signature` header (`t=…,v1=…`).
 */
export const genericProvider: PaymentProvider = {
  id: "generic",
  parseWebhook(rawBody, headers, secret) {
    if (!verifyWebhookSignature(secret, rawBody, headers.get("x-invoiceflow-signature"))) return null;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
    const status = body.status;
    if (status !== "succeeded" && status !== "failed" && status !== "refunded") return null;
    if (typeof body.id !== "string" || typeof body.amount !== "string" || !/^\d+(\.\d{1,2})?$/.test(body.amount)) return null;
    if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) return null;
    return {
      provider: "generic",
      providerRef: body.id,
      status,
      amount: body.amount,
      currency: body.currency,
      invoiceRef: typeof body.invoice === "string" ? body.invoice : undefined,
      organizationId: typeof body.organization === "string" ? body.organization : undefined,
    };
  },
};

export const PROVIDERS: Record<string, PaymentProvider> = { generic: genericProvider };
