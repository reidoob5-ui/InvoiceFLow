import { describe, expect, it } from "vitest";
import { computeTotals, deriveInvoiceStatus, balanceDue, CalcError } from "@/lib/invoice-calc";
import { hashPassword, verifyPassword, needsRehash, checkPasswordStrength } from "@/lib/auth/password";
import { base32Decode, base32Encode, totpCode, verifyTotp, generateTotpSecret } from "@/lib/auth/totp";
import { decryptSecret, encryptSecret, hashToken, newToken, signWebhook, verifyWebhookSignature } from "@/lib/auth/tokens";
import { can, assertCan, canAssignRole, ForbiddenError } from "@/lib/permissions";
import { nextOccurrence, dueRuns } from "@/lib/recurrence";
import { formatDocumentNumber } from "@/lib/numbering";
import { findRate, convert } from "@/lib/fx";
import { checkLimit, hasActiveAccess, applyCoupon, DEFAULT_PLANS } from "@/lib/plans";
import { csvCell, toCsv, parseCsv } from "@/lib/csv";
import { t, dictionaryKeys, LOCALES } from "@/lib/i18n";

describe("invoice totals", () => {
  it("avoids floating point errors (0.1 + 0.2 style)", () => {
    const r = computeTotals([{ quantity: 3, unitPrice: "0.10" }, { quantity: 1, unitPrice: "0.20" }]);
    expect(r.subtotal.toString()).toBe("0.5");
    expect(r.total.toString()).toBe("0.5");
  });

  it("applies line discount then tax, and lines add up to totals", () => {
    const r = computeTotals([
      { quantity: 2, unitPrice: "100.00", discountPercent: 10, taxRate: 14 },
      { quantity: 1, unitPrice: "49.99", taxRate: 14 },
    ]);
    // line1: gross 200, discount 20, net 180, tax 25.20 ; line2: net 49.99, tax 7.00 (6.9986 → 7.00)
    expect(r.subtotal.toFixed(2)).toBe("229.99");
    expect(r.discountTotal.toFixed(2)).toBe("20.00");
    expect(r.taxTotal.toFixed(2)).toBe("32.20");
    expect(r.total.toFixed(2)).toBe("262.19");
    expect(r.lines.reduce((a, l) => a + Number(l.net), 0)).toBeCloseTo(Number(r.subtotal), 2);
  });

  it("subtracts withholding from the total", () => {
    const r = computeTotals([{ quantity: 1, unitPrice: "1000", taxRate: 14 }], { withholdingRate: 6.5 });
    expect(r.withholdingTotal.toFixed(2)).toBe("65.00");
    expect(r.total.toFixed(2)).toBe("1075.00");
  });

  it("rounds half up per line", () => {
    const r = computeTotals([{ quantity: 1, unitPrice: "0.05", taxRate: 10 }]);
    expect(r.taxTotal.toFixed(2)).toBe("0.01"); // 0.005 → 0.01
  });

  it("rejects invalid input", () => {
    expect(() => computeTotals([{ quantity: -1, unitPrice: 1 }])).toThrow(CalcError);
    expect(() => computeTotals([{ quantity: 1, unitPrice: 1, taxRate: 150 }])).toThrow(CalcError);
    expect(() => computeTotals([{ quantity: 1, unitPrice: 1, discountPercent: -5 }])).toThrow(CalcError);
  });

  it("handles empty documents", () => {
    expect(computeTotals([]).total.toFixed(2)).toBe("0.00");
  });
});

describe("invoice status", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  it("paid when fully paid", () => {
    expect(deriveInvoiceStatus({ current: "ISSUED", total: 100, amountPaid: 100, now })).toBe("PAID");
  });
  it("partially paid", () => {
    expect(deriveInvoiceStatus({ current: "ISSUED", total: 100, amountPaid: 40, dueDate: new Date("2026-12-01"), now })).toBe("PARTIALLY_PAID");
  });
  it("overdue when past due and unpaid, even if partially paid", () => {
    expect(deriveInvoiceStatus({ current: "ISSUED", total: 100, amountPaid: 40, dueDate: new Date("2026-11-01"), now })).toBe("OVERDUE");
  });
  it("not overdue on the due date itself", () => {
    expect(deriveInvoiceStatus({ current: "ISSUED", total: 100, amountPaid: 0, dueDate: new Date("2026-11-17"), now })).toBe("ISSUED");
  });
  it("never changes DRAFT or VOID", () => {
    expect(deriveInvoiceStatus({ current: "VOID", total: 100, amountPaid: 100, now })).toBe("VOID");
    expect(deriveInvoiceStatus({ current: "DRAFT", total: 100, amountPaid: 100, now })).toBe("DRAFT");
  });
  it("balance never negative", () => {
    expect(balanceDue(100, 120).toString()).toBe("0");
    expect(balanceDue(100, 30).toString()).toBe("70");
  });
});

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("Correct-Horse-9");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-9", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
  });
  it("uses a unique salt", async () => {
    expect(await hashPassword("same-password-1A")).not.toBe(await hashPassword("same-password-1A"));
  });
  it("rejects unknown users and malformed hashes without throwing", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("checks strength", () => {
    expect(checkPasswordStrength("short1A!")).toContain("too_short");
    expect(checkPasswordStrength("password")).toContain("too_common");
    expect(checkPasswordStrength("alllowercaseletters")).toContain("needs_variety");
    expect(checkPasswordStrength("Str0ng-Passphrase!")).toEqual([]);
  });
});

describe("totp", () => {
  // RFC 6238 test vector: secret "12345678901234567890", T=59s → 94287082 (8 digits); 6-digit tail = 287082
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 6238 vector", () => {
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1111111109_000)).toBe("081804");
  });
  it("round-trips base32", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("verifies within the drift window only", () => {
    const now = 1_700_000_000_000;
    const code = totpCode(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now + 120_000)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });
  it("generates usable secrets", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
  });
});

describe("tokens and secrets", () => {
  it("hashes tokens deterministically and generates unique ones", () => {
    const a = newToken();
    expect(hashToken(a)).toBe(hashToken(a));
    expect(a).not.toBe(newToken());
  });
  it("encrypts and decrypts secrets, detecting tampering", () => {
    process.env.APP_SECRET = "x".repeat(40);
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const tampered = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("signs and verifies webhooks, rejecting stale or forged ones", () => {
    const body = JSON.stringify({ event: "payment.succeeded" });
    const now = 1_700_000_000;
    const sig = signWebhook("whsec", body, now);
    expect(verifyWebhookSignature("whsec", body, sig, 300, now + 10)).toBe(true);
    expect(verifyWebhookSignature("other", body, sig, 300, now + 10)).toBe(false);
    expect(verifyWebhookSignature("whsec", body + " ", sig, 300, now + 10)).toBe(false);
    expect(verifyWebhookSignature("whsec", body, sig, 300, now + 10_000)).toBe(false);
    expect(verifyWebhookSignature("whsec", body, null)).toBe(false);
  });
});

describe("permissions", () => {
  it("owner can do everything", () => {
    expect(can("OWNER", "billing:write")).toBe(true);
    expect(can("OWNER", "team:delete")).toBe(true);
  });
  it("admin cannot change billing", () => {
    expect(can("ADMIN", "billing:write")).toBe(false);
    expect(can("ADMIN", "team:write")).toBe(true);
  });
  it("member is mostly read-only", () => {
    expect(can("MEMBER", "invoices:read")).toBe(true);
    expect(can("MEMBER", "invoices:write")).toBe(false);
    expect(can("MEMBER", "settings:write")).toBe(false);
  });
  it("accountant handles money but not team or settings", () => {
    expect(can("ACCOUNTANT", "payments:write")).toBe(true);
    expect(can("ACCOUNTANT", "team:write")).toBe(false);
    expect(can("ACCOUNTANT", "settings:write")).toBe(false);
  });
  it("sales cannot touch expenses or payments", () => {
    expect(can("SALES", "quotes:send")).toBe(true);
    expect(can("SALES", "expenses:read")).toBe(false);
    expect(can("SALES", "payments:write")).toBe(false);
  });
  it("denies missing roles and throws on assert", () => {
    expect(can(null, "dashboard:read")).toBe(false);
    expect(() => assertCan("MEMBER", "team:write")).toThrow(ForbiddenError);
  });
  it("only owners assign OWNER", () => {
    expect(canAssignRole("ADMIN", "OWNER")).toBe(false);
    expect(canAssignRole("OWNER", "OWNER")).toBe(true);
    expect(canAssignRole("ADMIN", "MEMBER")).toBe(true);
    expect(canAssignRole("SALES", "MEMBER")).toBe(false);
  });
});

describe("recurrence", () => {
  const d = (s: string) => new Date(s + "T00:00:00Z");
  it("clamps month end and does not drift", () => {
    const feb = nextOccurrence(d("2026-01-31"), "MONTHLY", 1, 31);
    expect(feb.toISOString().slice(0, 10)).toBe("2026-02-28");
    const mar = nextOccurrence(feb, "MONTHLY", 1, 31);
    expect(mar.toISOString().slice(0, 10)).toBe("2026-03-31");
  });
  it("supports weekly, quarterly and yearly (incl. leap day)", () => {
    expect(nextOccurrence(d("2026-11-17"), "WEEKLY").toISOString().slice(0, 10)).toBe("2026-11-24");
    expect(nextOccurrence(d("2026-11-17"), "QUARTERLY").toISOString().slice(0, 10)).toBe("2027-02-17");
    expect(nextOccurrence(d("2028-02-29"), "YEARLY", 1, 29).toISOString().slice(0, 10)).toBe("2029-02-28");
  });
  it("catches up on missed runs and respects the end date", () => {
    const { runs, next } = dueRuns(d("2026-08-15"), d("2026-11-17"), "MONTHLY", 1);
    expect(runs.map((r) => r.toISOString().slice(0, 10))).toEqual(["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"]);
    expect(next.toISOString().slice(0, 10)).toBe("2026-12-15");
    const capped = dueRuns(d("2026-08-15"), d("2026-11-17"), "MONTHLY", 1, d("2026-09-30"));
    expect(capped.runs).toHaveLength(2);
  });
});

describe("numbering", () => {
  it("formats and sanitises prefixes", () => {
    expect(formatDocumentNumber("inv", 2026, 42)).toBe("INV-2026-0042");
    expect(formatDocumentNumber("a/b c!", 2026, 1)).toBe("ABC-2026-0001");
    expect(formatDocumentNumber("", 2026, 12345)).toBe("INV-2026-12345");
  });
});

describe("exchange rates", () => {
  const rows = [
    { base: "USD", quote: "AOA", rate: "900", date: new Date("2026-11-01") },
    { base: "USD", quote: "AOA", rate: "910", date: new Date("2026-11-10") },
    { base: "EUR", quote: "USD", rate: "1.10", date: new Date("2026-11-10") },
  ];
  const asOf = new Date("2026-11-17");
  it("uses the latest direct rate", () => {
    expect(findRate(rows, "USD", "AOA", undefined, asOf)?.toString()).toBe("910");
  });
  it("uses the inverse rate", () => {
    expect(findRate(rows, "AOA", "USD", undefined, asOf)?.toFixed(6)).toBe((1 / 910).toFixed(6));
  });
  it("triangulates via a pivot currency", () => {
    expect(findRate(rows, "EUR", "AOA", "USD", asOf)?.toString()).toBe("1001");
  });
  it("returns null instead of guessing", () => {
    expect(findRate(rows, "EUR", "AOA", undefined, asOf)).toBeNull();
    expect(findRate(rows, "GBP", "AOA", "USD", asOf)).toBeNull();
  });
  it("ignores future-dated rates and converts with rounding", () => {
    expect(findRate(rows, "USD", "AOA", undefined, new Date("2026-11-05"))?.toString()).toBe("900");
    expect(convert("10.333", "1.5").toString()).toBe("15.5");
  });
});

describe("plans", () => {
  const free = DEFAULT_PLANS[0].limits;
  it("enforces limits and treats null as unlimited", () => {
    expect(checkLimit(free, "maxInvoicesPerMonth", 4)).toEqual({ allowed: true, remaining: 0 });
    expect(checkLimit(free, "maxInvoicesPerMonth", 5)).toEqual({ allowed: false, limit: 5, used: 5 });
    expect(checkLimit(DEFAULT_PLANS[4].limits, "maxUsers", 9999)).toEqual({ allowed: true, remaining: null });
  });
  it("evaluates subscription access incl. trial, grace and cancel-at-period-end", () => {
    const now = new Date("2026-11-17");
    expect(hasActiveAccess({ status: "ACTIVE" }, now)).toBe(true);
    expect(hasActiveAccess({ status: "TRIALING", trialEndsAt: new Date("2026-11-20") }, now)).toBe(true);
    expect(hasActiveAccess({ status: "TRIALING", trialEndsAt: new Date("2026-11-10") }, now)).toBe(false);
    expect(hasActiveAccess({ status: "PAST_DUE", graceEndsAt: new Date("2026-11-20") }, now)).toBe(true);
    expect(hasActiveAccess({ status: "PAST_DUE" }, now)).toBe(false);
    expect(hasActiveAccess({ status: "CANCELED", currentPeriodEnd: new Date("2026-11-30") }, now)).toBe(true);
    expect(hasActiveAccess({ status: "EXPIRED" }, now)).toBe(false);
  });
  it("applies coupons without going negative", () => {
    expect(applyCoupon(100, { percentOff: 20 })).toBe(80);
    expect(applyCoupon(10, { amountOff: 25 })).toBe(0);
    expect(applyCoupon(29, { percentOff: 10 })).toBe(26.1);
  });
});

describe("csv", () => {
  it("escapes and neutralises formula injection", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toMatch(/^"'=HYPERLINK/);
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell(null)).toBe("");
  });
  it("round-trips through parseCsv", () => {
    const csv = toCsv(["name", "note"], [["Ana", 'a "quote", and, commas'], ["Bruno", "multi\nline"]]);
    expect(parseCsv(csv)).toEqual([["name", "note"], ["Ana", 'a "quote", and, commas'], ["Bruno", "multi\nline"]]);
  });
});

describe("i18n", () => {
  it("falls back to Portuguese then to the key", () => {
    expect(t("en", "common.save")).toBe("Save");
    expect(t("xx", "common.save")).toBe("Guardar");
    expect(t("en", "no.such.key")).toBe("no.such.key");
  });
  it("all locales define the same keys", () => {
    const base = dictionaryKeys("pt").sort();
    for (const l of LOCALES) expect(dictionaryKeys(l).sort()).toEqual(base);
  });
});
