import { randomUUID } from "node:crypto";

const SANDBOX_URL = "https://api.sandbox.proxypay.co.ao";
const PRODUCTION_URL = "https://api.proxypay.co.ao";

export type ProxyPayCharge = {
  id: string;
  amount: string;
  status: "active" | "used" | "expired";
  qrcode_url: string;
  deeplink: string | null;
  deeplink_redirect: string | null;
  expires_at: string;
  transaction_id: string | null;
};

export type ProxyPayTransaction = {
  id: string;
  type: "payment" | "refund";
  pos_id: number | null;
  charge_id?: string;
  amount: string | null;
  status: "accepted" | "rejected" | null;
  status_datetime?: string | null;
  status_reason?: string | null;
};

function config() {
  const token = process.env.PROXYPAY_API_TOKEN;
  const posId = Number(process.env.PROXYPAY_POS_ID);
  if (!token || !Number.isSafeInteger(posId) || posId <= 0) {
    throw new Error("ProxyPay is not configured. Set PROXYPAY_API_TOKEN and PROXYPAY_POS_ID.");
  }
  const baseUrl = process.env.PROXYPAY_ENV === "production" ? PRODUCTION_URL : SANDBOX_URL;
  return { token, posId, baseUrl };
}

export function isProxyPayConfigured(): boolean {
  return Boolean(process.env.PROXYPAY_API_TOKEN && Number(process.env.PROXYPAY_POS_ID) > 0);
}

export async function createProxyPayCharge(input: {
  amount: string;
  callbackUrl: string;
}): Promise<ProxyPayCharge> {
  const { token, posId, baseUrl } = config();
  const response = await fetch(baseUrl + "/opg/v1/charges", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ pos_id: posId, amount: input.amount, callback_url: input.callbackUrl }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("ProxyPay charge failed with HTTP " + response.status);
  const data = (await response.json()) as ProxyPayCharge;
  if (!data.id || !data.qrcode_url || !data.expires_at) throw new Error("ProxyPay returned an incomplete charge.");
  return data;
}

/** Authenticate callback data with the provider API; never trust the callback body alone. */
export async function getVerifiedProxyPayTransaction(id: string): Promise<ProxyPayTransaction> {
  const { token, posId, baseUrl } = config();
  const response = await fetch(baseUrl + "/opg/v1/transactions/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("ProxyPay transaction lookup failed with HTTP " + response.status);
  const transaction = (await response.json()) as ProxyPayTransaction;
  if (transaction.id !== id || transaction.pos_id !== posId) {
    throw new Error("ProxyPay transaction identity does not match this merchant.");
  }
  return transaction;
}
