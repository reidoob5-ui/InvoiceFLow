import { describe, expect, it } from "vitest";
import { ADMIN_IDLE_MS, ADMIN_MAX_MS, adminPasswordIssues, ipAllowed, lockoutRemainingMs, unlockState } from "../apps/web/lib/admin/vault-pure";

const T0 = new Date("2026-11-21T10:00:00Z");
const plus = (ms: number) => new Date(T0.getTime() + ms);

describe("unlockState", () => {
  it("is locked when never unlocked", () => expect(unlockState({}, T0)).toBe("locked"));
  it("is unlocked right after unlocking", () => expect(unlockState({ adminUnlockedAt: T0, adminLastSeenAt: T0 }, plus(1000))).toBe("unlocked"));
  it("locks after the idle timeout", () => expect(unlockState({ adminUnlockedAt: T0, adminLastSeenAt: T0 }, plus(ADMIN_IDLE_MS))).toBe("locked"));
  it("activity keeps it open until the absolute limit", () => {
    expect(unlockState({ adminUnlockedAt: T0, adminLastSeenAt: plus(ADMIN_MAX_MS - 60_000) }, plus(ADMIN_MAX_MS - 30_000))).toBe("unlocked");
    expect(unlockState({ adminUnlockedAt: T0, adminLastSeenAt: plus(ADMIN_MAX_MS - 60_000) }, plus(ADMIN_MAX_MS))).toBe("locked");
  });
});

describe("ipAllowed", () => {
  it("allows everyone when no list is configured", () => { expect(ipAllowed("1.2.3.4", undefined)).toBe(true); expect(ipAllowed(null, "")).toBe(true); });
  it("restricts to the list", () => { expect(ipAllowed("1.2.3.4", "1.2.3.4, 5.6.7.8")).toBe(true); expect(ipAllowed("9.9.9.9", "1.2.3.4")).toBe(false); expect(ipAllowed(null, "1.2.3.4")).toBe(false); });
});

describe("lockoutRemainingMs", () => {
  const fails = (n: number, endAgoMs: number) => Array.from({ length: n }, (_, i) => new Date(T0.getTime() - endAgoMs - i * 1000));
  it("no failures, no lock", () => expect(lockoutRemainingMs([], T0)).toBe(0));
  it("4 failures are still allowed", () => expect(lockoutRemainingMs(fails(4, 1000), T0)).toBe(0));
  it("5 failures in 15 min lock for 15 min after the last one", () => expect(lockoutRemainingMs(fails(5, 60_000), T0)).toBe(14 * 60_000));
  it("the lock expires", () => expect(lockoutRemainingMs(fails(5, 16 * 60_000), T0)).toBe(0));
  it("10 failures in a day lock for an hour", () => {
    const spread = Array.from({ length: 10 }, (_, i) => new Date(T0.getTime() - (i + 1) * 3 * 3600_000 / 10 * 2));
    expect(lockoutRemainingMs(spread, T0)).toBeGreaterThan(0);
  });
});

describe("adminPasswordIssues", () => {
  const email = "reidoob5@gmail.com";
  it("rejects short passwords", () => expect(adminPasswordIssues("Ab1!xyz", email)).toContain("too_short"));
  it("rejects low variety", () => expect(adminPasswordIssues("aaaaaaaaaaaaaaaa", email)).toContain("needs_variety"));
  it("rejects the e-mail name", () => expect(adminPasswordIssues("Reidoob5-Segredo-2026!", email)).toContain("contains_email"));
  it("rejects common words in short passwords", () => expect(adminPasswordIssues("Admin1234567890!", email)).toContain("too_common"));
  it("accepts a long passphrase", () => expect(adminPasswordIssues("o gato azul come peixe frito", email)).toEqual([]));
  it("accepts a mixed 14+ password", () => expect(adminPasswordIssues("Zq7#mP2$vL9@xK", email)).toEqual([]));
});
