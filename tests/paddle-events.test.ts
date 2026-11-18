import { describe, expect, it } from "vitest";
import { paddleSubscriptionStatus } from "../apps/web/lib/payments/paddle";

describe("Paddle subscription lifecycle event mapping", () => {
  it.each([
    ["subscription.activated", "active"],
    ["subscription.resumed", "active"],
    ["subscription.paused", "paused"],
    ["subscription.past_due", "past_due"],
    ["subscription.canceled", "canceled"],
    ["subscription.trialing", "trialing"],
  ] as const)("maps dedicated event %s to %s", (eventType, expected) => {
    expect(paddleSubscriptionStatus(eventType, undefined)).toBe(expected);
  });

  it("uses the status field for subscription.updated", () => {
    expect(paddleSubscriptionStatus("subscription.updated", "paused")).toBe("paused");
    expect(paddleSubscriptionStatus("subscription.updated", "past_due")).toBe("past_due");
    expect(paddleSubscriptionStatus("subscription.updated", "unknown")).toBeNull();
  });

  it("ignores unrelated Paddle events", () => {
    expect(paddleSubscriptionStatus("transaction.completed", "completed")).toBeNull();
  });
});
