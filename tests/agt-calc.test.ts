import { describe, expect, it } from "vitest";
import { computeLine, computeTotals, type LineInput } from "@/lib/agt/calc";
import { parseDecimal, centsToNumber } from "@/lib/agt/decimal";

const iva = (extra = {}) => ({ taxType: "IVA", taxCode: "NOR", ...extra });
const line = (over: Partial<LineInput> = {}): LineInput => ({
  operationType: "SG", productCode: "P", productDescription: "x", unitOfMeasure: "UN",
  quantity: 1, unitPrice: "100", tax: iva(), ...over,
});

describe("AGT cálculo", () => {
  it("decimal: rejeita lixo, negativos e excesso de casas", () => {
    expect(() => parseDecimal("abc")).toThrow(/inválido/);
    expect(() => parseDecimal("-1")).toThrow(/negativo/);
    expect(() => parseDecimal("1.1234567")).toThrow(/casas decimais/);
    expect(parseDecimal("1.5")).toBe(1_500_000n);
  });

  it("IVA 14% sobre 100,00 = 14,00", () => {
    const c = computeLine(line());
    expect(c.netCents).toBe(10000n);
    expect(c.taxes[0]!.contributionCents).toBe(1400n);
  });

  it("imposto arredondado POR EXCESSO (23,1448 -> 23,15)", () => {
    expect(computeLine(line({ unitPrice: "165.32" })).taxes[0]!.contributionCents).toBe(2315n);
    expect(computeLine(line({ unitPrice: "0.01" })).taxes[0]!.contributionCents).toBe(1n);
    expect(computeLine(line({ unitPrice: "150" })).taxes[0]!.contributionCents).toBe(2100n);
  });

  it("sem erros de vírgula flutuante", () => {
    const c = computeLine(line({ quantity: 3, unitPrice: "33.33" }));
    expect(c.netCents).toBe(9999n);
    expect(c.taxes[0]!.contributionCents).toBe(1400n);
    expect(computeLine(line({ quantity: "0.3", unitPrice: "3.35" })).netCents).toBe(101n);
  });

  it("desconto de linha e global", () => {
    const c = computeLine(line({ quantity: 2, discountPercent: "10" }), { globalDiscountPercent: "5" });
    expect(c.netCents).toBe(17100n);
    expect(c.settlementCents).toBe(2900n);
    expect(c.unitPriceBase).toBe(parseDecimal("85.5"));
  });

  it("isenção exige código válido e imposto = 0", () => {
    expect(() => computeLine(line({ tax: { taxType: "IVA", taxCode: "ISE" } }))).toThrow(/taxExemptionCode/);
    expect(() => computeLine(line({ tax: { taxType: "IVA", taxCode: "ISE", taxExemptionCode: "M99" } }))).toThrow(/não consta/);
    expect(computeLine(line({ tax: { taxType: "IVA", taxCode: "ISE", taxExemptionCode: "M22" } })).taxes[0]!.contributionCents).toBe(0n);
    expect(computeLine(line({ tax: { taxType: "NS", taxExemptionCode: "M02" } })).taxes[0]!.contributionCents).toBe(0n);
    expect(() => computeLine(line({ tax: { ...iva(), taxExemptionCode: "M22" } }))).toThrow(/só é permitido/);
  });

  it("taxas sem valor por defeito têm de ser explícitas", () => {
    expect(() => computeLine(line({ tax: { taxType: "IVA", taxCode: "RED" } }))).toThrow(/obrigatório/);
    expect(computeLine(line({ tax: { taxType: "IVA", taxCode: "RED", taxPercentage: "5" } })).taxes[0]!.contributionCents).toBe(500n);
  });

  it("imposto de valor fixo (IS) por excesso", () => {
    expect(computeLine(line({ quantity: 3, tax: { taxType: "IS", taxAmount: "1.111" } })).taxes[0]!.contributionCents).toBe(334n);
  });

  it("totais", () => {
    const ls = [line({ unitPrice: "165.32" }), line({ unitPrice: "10" })].map((l, i) => computeLine(l, {}, i + 1));
    const t = computeTotals(ls);
    expect(t.netCents).toBe(17532n);
    expect(t.taxCents).toBe(2315n + 140n);
    expect(centsToNumber(t.grossCents)).toBe(199.87);
  });
});
