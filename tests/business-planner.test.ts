import { describe, expect, it } from "vitest";
import { calculateBusinessPlan } from "../apps/web/lib/business-planner";

const sample = {
  capital: "500000",
  fixed: "120000",
  variable: "2500",
  price: "7500",
  units: "30",
  ownerPay: "100000",
  targetProfit: "100000",
  reserveMonths: "2",
};

describe("business health planner", () => {
  it("calculates the monthly result and sales target with decimal precision", () => {
    const result = calculateBusinessPlan(sample);
    expect(result.monthlyProfit.toFixed(2)).toBe("-70000.00");
    expect(result.targetUnits?.toFixed(0)).toBe("64");
    expect(result.targetRevenue?.toFixed(2)).toBe("480000.00");
    expect(result.monthlyOperatingCost.toFixed(2)).toBe("295000.00");
  });

  it("protects the chosen operating reserve before allowing extra spending", () => {
    const result = calculateBusinessPlan(sample);
    expect(result.reserveRequired.toFixed(2)).toBe("590000.00");
    expect(result.safeToSpend.toFixed(2)).toBe("0.00");
    const funded = calculateBusinessPlan({ ...sample, capital: "1000000" });
    expect(funded.safeToSpend.toFixed(2)).toBe("410000.00");
  });

  it("uses full operating costs when calculating runway", () => {
    const result = calculateBusinessPlan(sample);
    expect(result.runway?.toDecimalPlaces(2).toFixed(2)).toBe("1.69");
  });

  it("does not invent a sales target when every sale loses money", () => {
    const result = calculateBusinessPlan({ ...sample, price: "2000", variable: "2500" });
    expect(result.canBreakEven).toBe(false);
    expect(result.breakEven).toBeNull();
    expect(result.targetUnits).toBeNull();
    expect(result.targetRevenue).toBeNull();
  });

  it("keeps the reserve period within one and 24 months", () => {
    const zero = calculateBusinessPlan({ ...sample, reserveMonths: "0" });
    const excessive = calculateBusinessPlan({ ...sample, reserveMonths: "99" });
    expect(zero.reserveMonths.toFixed(0)).toBe("1");
    expect(excessive.reserveMonths.toFixed(0)).toBe("24");
  });
});
