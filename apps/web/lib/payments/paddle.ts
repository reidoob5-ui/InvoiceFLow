import { createHmac, timingSafeEqual } from "node:crypto";

const SANDBOX_URL = "https://sandbox-api.paddle.com";
const PRODUCTION_URL = "https://api.paddle.com";

export function paddlePriceId(planKey: string, interval: "MONTHLY" | "YEARLY"): string | null {
  const key = "PADDLE_PRICE_" + planKey.toUpperCase() + "_" + interval;
  return process.env[key] || null;
}

export function isPaddleConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_WEBHOOK_SECRET &&\n    process.env.PADDLE_PRICE_PRO_MONTHLY && process.env.PADDLE_PRICE_PRO_YEARLY &&\n    process.env.PADDLE_PRICE_BUSINESS_MONTHLY && process.env.PADDLE_PRICE_BUSINESS_YEARLY);
}

export async function createPaddleCheckout(input: {
  priceId: string;
  organizationId: string;
  planKey: string;
  interval: "MONTHLY" | "YEARLY";
  email?: string;
}): Promise<string> {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("Paddle is not configured. Set PADDLE_API_KEY.");
  const baseUrl = process.env.PADDLE_ENV === "production" ? PRODUCTION_URL : SANDBOX_URL;
  const response = await fetch(baseUrl + "/transactions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ price_id: input.priceId, quantity: 1 }],
      collection_mode: "automatic",
      custom_data: {
        organizationId: input.organizationId,
        planKey: input.planKey,
        interval: input.interval,
      },
      ...(input.email ? { customer: { email: input.email } } : {}),
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as {
    data?: { checkout?: { url?: string } };
    error?: { detail?: string };
  };
  if (!response.ok) throw new Error(body.error?.detail || "Paddle checkout failed with HTTP " + response.status);
  const url = body.data?.checkout?.url;
  if (!url || !url.startsWith("https://")) throw new Error("Paddle did not return a secure checkout URL.");
  return url;
}

/** Paddle signs timestamp:rawBody and sends ts=...,h1=... in Paddle-Signature. */
export function verifyPaddleWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(";").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("ts="))?.slice(3);
  const signatures = parts.filter((part) => part.startsWith("h1=")).map((part) => part.slice(3));
  const ts = Number(timestamp);
  if (!timestamp || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300 || signatures.length === 0) return false;
  const expected = createHmac("sha256", secret).update(timestamp + ":" + rawBody).digest("hex");
  return signatures.some((signature) => {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
