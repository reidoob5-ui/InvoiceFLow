import { parseDecimal, divRound, centsToNumber, scaledToNumber } from "./decimal";
import { DEFAULT_IVA_RATES, IVA_EXEMPTIONS, IS_EXEMPTIONS, IEC_EXEMPTIONS, IVA_CODES } from "./codes";

const P100 = 100n * 10n ** 6n; // 100% com escala 6
const C10 = 10n ** 10n; // 12 casas -> cêntimos

export type TaxInput = {
  taxType?: string; type?: string;
  taxCode?: string; code?: string;
  taxExemptionCode?: string; exemptionCode?: string;
  taxCountryRegion?: string;
  taxPercentage?: number | string; percentage?: number | string;
  taxAmount?: number | string | null;
};

export type LineInput = {
  operationType: string;
  operationDate?: string;
  productCode: string;
  productDescription: string;
  quantity: number | string;
  unitPrice: number | string;
  unitOfMeasure: string;
  discountPercent?: number | string;
  tax?: TaxInput;
  taxes?: TaxInput[];
  referenceInfo?: { reference: string; reason?: string };
};

export type ComputedTax = {
  taxType: string; taxCountryRegion: string; taxCode?: string; taxExemptionCode?: string;
  pctScaled: bigint; contributionCents: bigint; taxAmountScaled?: bigint;
};

export type ComputedLine = {
  qty: bigint; price: bigint; unitPriceBase: bigint;
  grossCents: bigint; netCents: bigint; settlementCents: bigint; taxes: ComputedTax[];
};

/**
 * Calcula uma linha, tudo em inteiros (BigInt):
 *  - valor líquido arredondado a meio-para-cima ao cêntimo (PRESSUPOSTO: o decreto só fixa o do imposto);
 *  - imposto arredondado POR EXCESSO ao cêntimo seguinte (regra do decreto: 23,144 -> 23,15).
 */
export function computeLine(
  line: LineInput,
  { globalDiscountPercent = "0" }: { globalDiscountPercent?: number | string } = {},
  lineNo = 1,
): ComputedLine {
  const f = (n: string) => `lines[${lineNo - 1}].${n}`;
  const qty = parseDecimal(line.quantity, f("quantity"));
  const price = parseDecimal(line.unitPrice, f("unitPrice"));
  const dp = parseDecimal(line.discountPercent ?? 0, f("discountPercent"));
  const gp = parseDecimal(globalDiscountPercent, "globalDiscountPercent");
  if (dp > P100) throw new RangeError(`${f("discountPercent")}: não pode exceder 100%`);
  if (gp > P100) throw new RangeError("globalDiscountPercent: não pode exceder 100%");

  const gross12 = qty * price; // escala 12, exacto
  const grossCents = divRound(gross12, C10);
  const netCents = divRound(gross12 * (P100 - dp) * (P100 - gp), P100 * P100 * C10);
  const settlementCents = grossCents - netCents;
  const unitPriceBase = divRound(price * (P100 - dp) * (P100 - gp), P100 * P100);

  const rawTaxes = line.taxes ?? (line.tax ? [line.tax] : []);
  const taxes = rawTaxes.map((t, i) => computeTax(t, { netCents, qty }, `${f("taxes")}[${i}]`));
  if (taxes.length === 0) {
    throw new RangeError(`${f("taxes")}: cada linha precisa de pelo menos um imposto (use NS/ISE se não sujeita)`);
  }
  return { qty, price, unitPriceBase, grossCents, netCents, settlementCents, taxes };
}

function computeTax(t: TaxInput, { netCents, qty }: { netCents: bigint; qty: bigint }, path: string): ComputedTax {
  const taxType = t.taxType ?? t.type;
  let taxCode = t.taxCode ?? t.code;
  const exemption = t.taxExemptionCode ?? t.exemptionCode;
  const region = t.taxCountryRegion ?? "AO";

  if (taxType === "IVA") {
    if (!taxCode || !IVA_CODES.has(taxCode)) throw new RangeError(`${path}.taxCode: use NOR, INT, RED, ISE ou OUT`);
  } else if (taxType === "NS") {
    taxCode = undefined;
  } else if (taxType !== "IS" && taxType !== "IEC") {
    throw new RangeError(`${path}.taxType: use IVA, IS, IEC ou NS`);
  }

  const exempt = taxType === "NS" || taxCode === "ISE";
  if (exempt) {
    if (!exemption) throw new RangeError(`${path}.taxExemptionCode: obrigatório para isenção/não sujeição`);
    const ok =
      taxType === "IS" ? IS_EXEMPTIONS.has(exemption) : taxType === "IEC" ? IEC_EXEMPTIONS.has(exemption) : exemption in IVA_EXEMPTIONS;
    if (!ok) throw new RangeError(`${path}.taxExemptionCode: código "${exemption}" não consta das tabelas do decreto`);
    return { taxType: taxType!, taxCountryRegion: region, taxCode, taxExemptionCode: exemption, pctScaled: 0n, contributionCents: 0n };
  }
  if (exemption) throw new RangeError(`${path}.taxExemptionCode: só é permitido em linhas isentas/não sujeitas`);

  if (t.taxAmount !== undefined && t.taxAmount !== null) {
    if (taxType === "IVA") throw new RangeError(`${path}.taxAmount: valor fixo só se aplica a IS/IEC`);
    const amt = parseDecimal(t.taxAmount, `${path}.taxAmount`);
    return {
      taxType: taxType!, taxCountryRegion: region, taxCode, pctScaled: 0n, taxAmountScaled: amt,
      contributionCents: divRound(amt * qty, C10, "ceil"),
    };
  }
  let pct = t.taxPercentage ?? t.percentage;
  if (pct === undefined && taxType === "IVA" && taxCode) pct = DEFAULT_IVA_RATES[taxCode];
  if (pct === undefined) {
    throw new RangeError(`${path}.taxPercentage: obrigatório (a taxa "${taxCode}" não tem valor por defeito)`);
  }
  const pctScaled = parseDecimal(pct, `${path}.taxPercentage`);
  return {
    taxType: taxType!, taxCountryRegion: region, taxCode, pctScaled,
    contributionCents: divRound(netCents * pctScaled, P100, "ceil"), // por excesso, regra do decreto
  };
}

export function computeTotals(lines: ComputedLine[]) {
  let net = 0n;
  let tax = 0n;
  for (const l of lines) {
    net += l.netCents;
    for (const t of l.taxes) tax += t.contributionCents;
  }
  return { netCents: net, taxCents: tax, grossCents: net + tax };
}

/** Converte uma linha calculada para o objecto JSON do Anexo I. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lineToJson(c: ComputedLine, input: LineInput, lineNo: number, isDebit: boolean): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {
    lineNumber: lineNo,
    operationType: input.operationType,
    ...(input.operationDate !== undefined ? { operationDate: input.operationDate } : {}),
    productCode: input.productCode,
    productDescription: input.productDescription,
    quantity: scaledToNumber(c.qty),
    unitOfMeasure: input.unitOfMeasure,
    unitPriceBase: scaledToNumber(c.price), // preço base, sem descontos nem impostos
    unitPrice: scaledToNumber(c.unitPriceBase), // já deduzido de descontos, sem impostos
  };
  if (input.referenceInfo) {
    out.referenceInfo = { reference: input.referenceInfo.reference };
    if (input.referenceInfo.reason !== undefined) out.referenceInfo.reason = input.referenceInfo.reason;
  }
  out[isDebit ? "debitAmount" : "creditAmount"] = centsToNumber(c.netCents);
  out.taxes = c.taxes.map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: Record<string, any> = { taxType: t.taxType, taxCountryRegion: t.taxCountryRegion };
    if (t.taxCode) j.taxCode = t.taxCode;
    j.taxPercentage = scaledToNumber(t.pctScaled);
    if (t.taxAmountScaled !== undefined) j.taxAmount = scaledToNumber(t.taxAmountScaled);
    j.taxContribution = centsToNumber(t.contributionCents);
    if (t.taxExemptionCode) j.taxExemptionCode = t.taxExemptionCode;
    return j;
  });
  out.settlementAmount = centsToNumber(c.settlementCents);
  return out;
}
