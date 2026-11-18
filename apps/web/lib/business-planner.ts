import Decimal from "decimal.js";

export type BusinessPlanInput = {
  capital: string;
  fixed: string;
  variable: string;
  price: string;
  units: string;
  ownerPay: string;
  targetProfit: string;
  reserveMonths: string;
};

function readAmount(raw: string): Decimal {
  const value = String(raw ?? "").trim();
  if (!/^\d{1,12}(?:\.\d{0,2})?$/.test(value)) return new Decimal(0);
  try { return new Decimal(value); } catch { return new Decimal(0); }
}

export function calculateBusinessPlan(input: BusinessPlanInput) {
  const capital = readAmount(input.capital);
  const fixed = readAmount(input.fixed);
  const variable = readAmount(input.variable);
  const price = readAmount(input.price);
  const units = readAmount(input.units);
  const ownerPay = readAmount(input.ownerPay);
  const targetProfit = readAmount(input.targetProfit);
  const reserveMonths = Decimal.max(1, Decimal.min(24, readAmount(input.reserveMonths).toDecimalPlaces(0, Decimal.ROUND_DOWN)));
  const contribution = price.minus(variable);
  const monthlyTarget = fixed.plus(ownerPay);
  const canBreakEven = contribution.gt(0);
  const breakEven = canBreakEven ? monthlyTarget.div(contribution).ceil() : null;
  const minimumPrice = units.gt(0) ? variable.plus(monthlyTarget.div(units)) : null;
  const monthlyProfit = contribution.mul(units).minus(monthlyTarget);
  const margin = price.gt(0) ? contribution.div(price).mul(100) : new Decimal(0);
  const monthlyOperatingCost = monthlyTarget.plus(variable.mul(units));
  const runway = monthlyOperatingCost.gt(0) ? capital.div(monthlyOperatingCost) : null;
  const targetUnits = canBreakEven ? monthlyTarget.plus(targetProfit).div(contribution).ceil() : null;
  const targetRevenue = targetUnits ? targetUnits.mul(price) : null;
  const reserveRequired = monthlyOperatingCost.mul(reserveMonths);
  const safeToSpend = Decimal.max(0, capital.minus(reserveRequired));

  return {
    capital, fixed, variable, price, units, ownerPay, targetProfit, reserveMonths,
    contribution, monthlyTarget, canBreakEven, breakEven, minimumPrice,
    monthlyProfit, margin, monthlyOperatingCost, runway, targetUnits,
    targetRevenue, reserveRequired, safeToSpend,
  };
}
