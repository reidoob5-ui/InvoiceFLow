import { describe, expect, it } from "vitest";
import { addPeriod, classifySubscription, newReference, whatsappLink } from "../apps/web/lib/billing/pure";

const d = (s: string) => new Date(s);
const NOW = d("2026-11-21T10:00:00Z");

describe("addPeriod", () => {
  it("adds one month keeping the day", () => expect(addPeriod(d("2026-11-21T10:00:00Z"), "MONTHLY").toISOString()).toBe("2026-12-21T10:00:00.000Z"));
  it("clamps to the last day of a shorter month", () => expect(addPeriod(d("2026-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2026-02-28T00:00:00.000Z"));
  it("handles year rollover and leap years", () => {
    expect(addPeriod(d("2026-12-15T00:00:00Z"), "MONTHLY").toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(addPeriod(d("2028-02-29T00:00:00Z"), "YEARLY").toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });
});

describe("newReference / whatsappLink", () => {
  it("makes IF- references without ambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(newReference()).toMatch(/^IF-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });
  it("builds a wa.me link with the message encoded", () => {
    expect(whatsappLink("+244 923 000 000", "Olá ref IF-X")).toBe("https://wa.me/244923000000?text=Ol%C3%A1%20ref%20IF-X");
  });
  it("refuses numbers that are too short", () => expect(whatsappLink("123", "x")).toBeNull());
});

describe("classifySubscription — quem pagou e quem não pagou", () => {
  const paid = { status: "ACTIVE" as const, currentPeriodEnd: d("2026-12-21T00:00:00Z") };
  it("no subscription", () => expect(classifySubscription(null, 19000, NOW)).toBe("NO_PLAN"));
  it("paid and in date", () => expect(classifySubscription(paid, 19000, NOW)).toBe("PAID"));
  it("paid but expiring within 7 days", () => expect(classifySubscription({ status: "ACTIVE", currentPeriodEnd: d("2026-11-25T00:00:00Z") }, 19000, NOW)).toBe("EXPIRING"));
  it("period over means NOT paid, even if the stored status still says ACTIVE", () => expect(classifySubscription({ status: "ACTIVE", currentPeriodEnd: d("2026-11-01T00:00:00Z") }, 19000, NOW)).toBe("UNPAID"));
  it("expired status is not paid", () => expect(classifySubscription({ status: "EXPIRED", currentPeriodEnd: d("2026-10-01T00:00:00Z") }, 19000, NOW)).toBe("UNPAID"));
  it("trial in date vs trial over", () => {
    expect(classifySubscription({ status: "TRIALING", trialEndsAt: d("2026-11-30T00:00:00Z") }, 19000, NOW)).toBe("TRIAL");
    expect(classifySubscription({ status: "TRIALING", trialEndsAt: d("2026-11-10T00:00:00Z") }, 19000, NOW)).toBe("UNPAID");
  });
  it("suspended", () => expect(classifySubscription({ status: "PAUSED", currentPeriodEnd: d("2026-12-21T00:00:00Z") }, 19000, NOW)).toBe("SUSPENDED"));
  it("free plan", () => expect(classifySubscription({ status: "ACTIVE", currentPeriodEnd: null }, 0, NOW)).toBe("FREE"));
});
