import { describe, expect, it } from "vitest";
import { hasActiveAccess } from "../apps/web/lib/plans";

describe("subscription access lifecycle", () => {
  const now = new Date("2026-11-18T12:00:00.000Z");

  it("keeps an active subscription only through its paid period", () => {
    expect(hasActiveAccess({ status: "ACTIVE", currentPeriodEnd: new Date("2026-11-19T00:00:00.000Z") }, now)).toBe(true);
    expect(hasActiveAccess({ status: "ACTIVE", currentPeriodEnd: new Date("2026-11-18T11:59:59.000Z") }, now)).toBe(false);
  });

  it("keeps active free subscriptions without a billing end date", () => {
    expect(hasActiveAccess({ status: "ACTIVE", currentPeriodEnd: null }, now)).toBe(true);
  });

  it("allows a past-due subscription only during the grace period", () => {
    expect(hasActiveAccess({ status: "PAST_DUE", graceEndsAt: new Date("2026-11-20T00:00:00.000Z") }, now)).toBe(true);
    expect(hasActiveAccess({ status: "PAST_DUE", graceEndsAt: new Date("2026-11-18T11:59:59.000Z") }, now)).toBe(false);
  });

  it("does not grant access to paused or expired subscriptions", () => {
    expect(hasActiveAccess({ status: "PAUSED" }, now)).toBe(false);
    expect(hasActiveAccess({ status: "EXPIRED" }, now)).toBe(false);
  });

  it("preserves access for a scheduled cancellation until the paid period ends", () => {
    expect(hasActiveAccess({ status: "ACTIVE", currentPeriodEnd: new Date("2026-11-25T00:00:00.000Z") }, now)).toBe(true);
    expect(hasActiveAccess({ status: "CANCELED", currentPeriodEnd: new Date("2026-11-25T00:00:00.000Z") }, now)).toBe(true);
  });

  it("revokes access once a cancellation takes effect", () => {
    expect(hasActiveAccess({ status: "CANCELED", currentPeriodEnd: now }, now)).toBe(false);
  });
});
