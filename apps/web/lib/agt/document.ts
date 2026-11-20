/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DOCUMENT_TYPES, OPERATION_TYPES, RECEIPT_TYPES, DEBIT_LINE_TYPES, DOCUMENT_STATUS, CANCEL_REASONS,
  TAX_TYPES, IVA_CODES, WITHHOLDING_TYPES, IVA_EXEMPTIONS, IS_EXEMPTIONS, IEC_EXEMPTIONS,
} from "./codes";
import { computeLine, computeTotals, lineToJson, type LineInput } from "./calc";
import { parseDecimal, divRound, centsToNumber, scaledToNumber, ONE } from "./decimal";
import { luandaParts } from "./series";
import { signDocument } from "./signing";

export type ValidationIssue = { path: string; message: string };

export class DocumentValidationError extends Error {
  errors: ValidationIssue[];
  constructor(errors: ValidationIssue[]) {
    super(`Documento inválido:\n${errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n")}`);
    this.name = "DocumentValidationError";
    this.errors = errors;
  }
}

export type DocumentInput = {
  documentType: string;
  documentStatus?: string;
  documentCancelReason?: string;
  rejectedDocumentNo?: string;
  documentDate?: string;
  eacCode?: string | number;
  customer?: { taxId?: string; country?: string };
  lines?: LineInput[];
  globalDiscountPercent?: number | string;
  currency?: { code: string; rate: number | string; amount?: number | string };
  withholdingTaxList?: Array<Record<string, any>>;
  // preenchidos pelo emissor
  seriesCode?: string;
  seriesYear?: number;
  sourceDocumentNos?: string[];
};

export type ReceiptSource = {
  documentNo: string; documentType: string; documentDate: string; netCents: bigint; taxCents: bigint;
};

export type BuildContext = {
  nif: string; companyName: string; signingKey: string; documentNo: string; now?: Date; sources?: ReceiptSource[];
};

/** Constrói o objecto "document" do Anexo I, já assinado. */
export function buildDocument(input: DocumentInput, ctx: BuildContext): Record<string, any> {
  const type = input.documentType;
  if (!(type in DOCUMENT_TYPES)) throw new DocumentValidationError([{ path: "documentType", message: `tipo inválido: ${type}` }]);
  const isReceipt = RECEIPT_TYPES.has(type);
  const isDebit = DEBIT_LINE_TYPES.has(type);
  const status = input.documentStatus ?? "N";
  const { date, dateTime } = luandaParts(ctx.now ?? new Date());

  const country = String(input.customer?.country ?? "AO").toUpperCase();
  const taxId = input.customer?.taxId ?? (country === "AO" ? "999999999" : undefined);

  let lines: any[] | undefined;
  let paymentReceipt: any;
  let totals: { netCents: bigint; taxCents: bigint; grossCents: bigint };

  if (!isReceipt) {
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new DocumentValidationError([{ path: "lines", message: "obrigatório para este tipo de documento" }]);
    }
    const computed = input.lines.map((l, i) => computeLine(l, { globalDiscountPercent: input.globalDiscountPercent ?? "0" }, i + 1));
    lines = computed.map((c, i) => lineToJson(c, input.lines![i]!, i + 1, isDebit));
    totals = computeTotals(computed);
  } else {
    const sources = ctx.sources ?? [];
    if (sources.length === 0) throw new DocumentValidationError([{ path: "paymentReceipt", message: "recibo sem documentos de origem" }]);
    let net = 0n;
    let tax = 0n;
    paymentReceipt = {
      sourceDocuments: sources.map((s, i) => {
        const sign = s.documentType === "NC" ? -1n : 1n; // NC com sinal negativo
        net += sign * s.netCents;
        tax += sign * s.taxCents;
        return {
          lineNo: i + 1,
          sourceDocumentID: { OriginatingON: s.documentNo, documentDate: s.documentDate },
          [s.documentType === "NC" ? "debitAmount" : "creditAmount"]: centsToNumber(s.netCents),
        };
      }),
    };
    totals = { netCents: net, taxCents: tax, grossCents: net + tax };
  }

  const documentTotals: Record<string, any> = {
    taxPayable: centsToNumber(totals.taxCents),
    netTotal: centsToNumber(totals.netCents),
    grossTotal: centsToNumber(totals.grossCents),
  };
  if (input.currency && input.currency.code !== "AOA") {
    const rate = parseDecimal(input.currency.rate, "currency.rate");
    if (rate <= 0n) throw new DocumentValidationError([{ path: "currency.rate", message: "taxa de câmbio tem de ser > 0" }]);
    const abs = totals.grossCents < 0n ? -totals.grossCents : totals.grossCents;
    const foreignCents =
      input.currency.amount !== undefined
        ? parseDecimal(input.currency.amount, "currency.amount") / 10000n
        : divRound(abs * ONE, rate);
    documentTotals.currency = {
      currencyCode: input.currency.code,
      currencyAmount: centsToNumber(foreignCents),
      exchangeRate: scaledToNumber(rate),
    };
  }

  let withholdingTaxList: any[] | undefined;
  if (input.withholdingTaxList?.length) {
    withholdingTaxList = input.withholdingTaxList.map((w) => {
      const o: Record<string, any> = { withholdingTaxType: w.type ?? w.withholdingTaxType };
      const desc = w.description ?? w.withholdingTaxDescription;
      if (desc !== undefined) o.withholdingTaxDescription = desc;
      o.withholdingTaxAmount = centsToNumber(divRound(parseDecimal(w.amount ?? w.withholdingTaxAmount, "withholdingTaxAmount"), 10000n));
      return o;
    });
  }

  // Monta pela ordem do Anexo I. A assinatura é calculada com base nestes campos.
  const base: Record<string, any> = {
    documentNo: ctx.documentNo,
    documentStatus: status,
    ...(status === "A" ? { documentCancelReason: input.documentCancelReason } : {}),
    ...(status === "C" ? { rejectedDocumentNo: input.rejectedDocumentNo } : {}),
    documentDate: input.documentDate ?? date,
    documentType: type,
    ...(input.eacCode ? { eacCode: String(input.eacCode) } : {}),
    systemEntryDate: dateTime,
    customerCountry: country,
    customerTaxID: taxId === undefined ? undefined : String(taxId),
    companyName: ctx.companyName,
    ...(lines ? { lines } : {}),
    ...(paymentReceipt ? { paymentReceipt } : {}),
    documentTotals,
    ...(withholdingTaxList ? { withholdingTaxList } : {}),
  };
  const jws = signDocument(base, ctx.nif, ctx.signingKey);
  const doc: Record<string, any> = {};
  for (const [k, v] of Object.entries(base)) {
    if (k === "documentDate") doc.jwsDocumentSignature = jws; // posição do Anexo I
    doc[k] = v;
  }

  const errs = validateDocument(doc);
  if (errs.length) throw new DocumentValidationError(errs);
  return doc;
}

const cents = (v: number) => Math.round(v * 100);
const isStr = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max;

/** Valida um "document" contra as restrições do Anexo I. Devolve [] se estiver conforme. */
export function validateDocument(d: Record<string, any>): ValidationIssue[] {
  const e: ValidationIssue[] = [];
  const need = (cond: unknown, path: string, message: string) => {
    if (!cond) e.push({ path, message });
  };

  need(isStr(d.documentNo, 8, 60), "documentNo", "obrigatório, 8 a 60 caracteres");
  need(d.documentStatus in DOCUMENT_STATUS, "documentStatus", "valores: N, S, A, R, C");
  if (d.documentStatus === "A") {
    need(d.documentCancelReason in CANCEL_REASONS, "documentCancelReason", "obrigatório quando anulado (I ou N)");
  } else need(d.documentCancelReason === undefined, "documentCancelReason", "só se documentStatus = A");
  if (d.documentStatus === "C") {
    need(isStr(d.rejectedDocumentNo, 8, 60), "rejectedDocumentNo", "obrigatório quando documentStatus = C");
  } else need(d.rejectedDocumentNo === undefined, "rejectedDocumentNo", "só se documentStatus = C");
  need(typeof d.jwsDocumentSignature === "string" && d.jwsDocumentSignature.length > 0, "jwsDocumentSignature", "obrigatória");
  need(/^\d{4}-\d{2}-\d{2}$/.test(d.documentDate ?? "") && !Number.isNaN(Date.parse(d.documentDate)), "documentDate", "formato YYYY-MM-DD válido");
  need(d.documentType in DOCUMENT_TYPES, "documentType", "tipo inválido");
  if (d.eacCode !== undefined) need(/^\d{5}$/.test(d.eacCode), "eacCode", "5 dígitos (Tabela 1)");
  need(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(d.systemEntryDate ?? ""), "systemEntryDate", "formato YYYY-MM-DDThh:mm:ss");
  need(/^[A-Z]{2}$/.test(d.customerCountry ?? ""), "customerCountry", "ISO 3166-1 alpha-2 (ex.: AO)");
  need(isStr(d.customerTaxID, 1, 50), "customerTaxID", "obrigatório, 1 a 50 caracteres");
  need(isStr(d.companyName, 1, 200), "companyName", "obrigatório, 1 a 200 caracteres");

  const isReceipt = RECEIPT_TYPES.has(d.documentType);
  if (isReceipt) {
    need(d.lines === undefined, "lines", "não pode existir em AR, RC ou RG");
    need(Array.isArray(d.paymentReceipt?.sourceDocuments) && d.paymentReceipt.sourceDocuments.length > 0, "paymentReceipt", "obrigatório em AR, RC e RG");
    (d.paymentReceipt?.sourceDocuments ?? []).forEach((s: any, i: number) => {
      const p = `paymentReceipt.sourceDocuments[${i}]`;
      need(s.lineNo === i + 1, `${p}.lineNo`, "sequencial a partir de 1");
      need(isStr(s.sourceDocumentID?.OriginatingON, 1, 60), `${p}.sourceDocumentID.OriginatingON`, "1 a 60 caracteres");
      need(/^\d{4}-\d{2}-\d{2}$/.test(s.sourceDocumentID?.documentDate ?? ""), `${p}.sourceDocumentID.documentDate`, "data inválida");
      need((s.debitAmount === undefined) !== (s.creditAmount === undefined), p, "um e só um de debitAmount/creditAmount");
    });
  } else {
    need(d.paymentReceipt === undefined, "paymentReceipt", "só em AR, RC ou RG");
    need(Array.isArray(d.lines) && d.lines.length > 0, "lines", "obrigatório para este tipo de documento");
    (d.lines ?? []).forEach((l: any, i: number) => validateLine(l, i, d, need));
  }

  const t = d.documentTotals;
  need(t && typeof t === "object", "documentTotals", "obrigatório");
  if (t) {
    for (const k of ["taxPayable", "netTotal", "grossTotal"]) need(typeof t[k] === "number" && Number.isFinite(t[k]), `documentTotals.${k}`, "número obrigatório");
    if ([t.taxPayable, t.netTotal, t.grossTotal].every((x) => typeof x === "number")) {
      need(cents(t.grossTotal) === cents(t.netTotal) + cents(t.taxPayable), "documentTotals.grossTotal", "tem de ser netTotal + taxPayable");
    }
    if (!isReceipt && Array.isArray(d.lines)) {
      const net = d.lines.reduce((a: number, l: any) => a + cents(l.debitAmount ?? l.creditAmount ?? 0), 0);
      const tax = d.lines.reduce((a: number, l: any) => a + (l.taxes ?? []).reduce((b: number, x: any) => b + cents(x.taxContribution ?? 0), 0), 0);
      need(net === cents(t.netTotal ?? NaN), "documentTotals.netTotal", "não corresponde à soma das linhas");
      need(tax === cents(t.taxPayable ?? NaN), "documentTotals.taxPayable", "não corresponde à soma dos impostos das linhas");
    }
    if (t.currency !== undefined) {
      const c = t.currency;
      need(/^[A-Z]{3}$/.test(c.currencyCode ?? "") && c.currencyCode !== "AOA", "documentTotals.currency.currencyCode", "ISO 4217, excluindo AOA");
      need(c.currencyAmount > 0, "documentTotals.currency.currencyAmount", "tem de ser > 0");
      need(c.exchangeRate > 0, "documentTotals.currency.exchangeRate", "tem de ser > 0");
    }
  }

  (d.withholdingTaxList ?? []).forEach((w: any, i: number) => {
    const p = `withholdingTaxList[${i}]`;
    need(WITHHOLDING_TYPES.has(w.withholdingTaxType), `${p}.withholdingTaxType`, "IRT, II, IS, IVA, IP, IAC, OU, IRPC ou IRPS");
    need(w.withholdingTaxDescription === undefined || w.withholdingTaxDescription.length <= 120, `${p}.withholdingTaxDescription`, "máx. 120 caracteres");
    need(typeof w.withholdingTaxAmount === "number", `${p}.withholdingTaxAmount`, "obrigatório");
  });
  return e;
}

function validateLine(l: any, i: number, d: any, need: (c: unknown, p: string, m: string) => void) {
  const p = `lines[${i}]`;
  need(l.lineNumber === i + 1, `${p}.lineNumber`, "começa em 1 e incrementa 1 a 1");
  need(OPERATION_TYPES.has(l.operationType), `${p}.operationType`, "obrigatório: SE, SS, STP, SR, SIF, SHS, ST, SG, TB, AS, QT ou RD");
  if (["GF", "FG"].includes(d.documentType)) need(/^\d{4}-\d{2}-\d{2}$/.test(l.operationDate ?? ""), `${p}.operationDate`, "obrigatória em GF e FG");
  need(isStr(l.productCode, 1, 60), `${p}.productCode`, "1 a 60 caracteres");
  need(isStr(l.productDescription, 1, 200), `${p}.productDescription`, "1 a 200 caracteres");
  need(typeof l.quantity === "number" && l.quantity >= 0, `${p}.quantity`, ">= 0");
  need(isStr(l.unitOfMeasure, 1, 20), `${p}.unitOfMeasure`, "1 a 20 caracteres");
  need(typeof l.unitPrice === "number" && l.unitPrice >= 0, `${p}.unitPrice`, ">= 0 (já com descontos)");
  need(typeof l.unitPriceBase === "number" && l.unitPriceBase >= 0, `${p}.unitPriceBase`, ">= 0");
  need(typeof l.settlementAmount === "number" && l.settlementAmount >= 0, `${p}.settlementAmount`, "obrigatório, >= 0");
  need((l.debitAmount === undefined) !== (l.creditAmount === undefined), p, "preencher um e só um de debitAmount/creditAmount");
  if (d.documentType === "NC") {
    need(isStr(l.referenceInfo?.reference, 1, 60), `${p}.referenceInfo.reference`, "obrigatório em notas de crédito (documento de origem)");
  }
  if (l.referenceInfo?.reason !== undefined) need(l.referenceInfo.reason.length <= 60, `${p}.referenceInfo.reason`, "máx. 60 caracteres");
  need(Array.isArray(l.taxes) && l.taxes.length > 0, `${p}.taxes`, "pelo menos um imposto");
  (l.taxes ?? []).forEach((t: any, j: number) => {
    const q = `${p}.taxes[${j}]`;
    need(TAX_TYPES.has(t.taxType), `${q}.taxType`, "IVA, IS, IEC, CEOC ou NS");
    need(isStr(t.taxCountryRegion, 2, 6), `${q}.taxCountryRegion`, "ISO 3166-1 alpha-2 ou AO-CAB");
    if (t.taxCode !== undefined) need(isStr(t.taxCode, 2, 10), `${q}.taxCode`, "2 a 10 caracteres");
    if (t.taxType === "IVA") need(IVA_CODES.has(t.taxCode), `${q}.taxCode`, "obrigatório com IVA: NOR, INT, RED, ISE ou OUT");
    need(typeof t.taxPercentage === "number" && t.taxPercentage >= 0, `${q}.taxPercentage`, "obrigatório, >= 0 (0 se isento)");
    need(typeof t.taxContribution === "number" && t.taxContribution >= 0, `${q}.taxContribution`, "obrigatório, >= 0");
    const exempt = t.taxType === "NS" || t.taxCode === "ISE";
    if (exempt) {
      const ok = t.taxType === "IS" ? IS_EXEMPTIONS.has(t.taxExemptionCode) : t.taxType === "IEC" ? IEC_EXEMPTIONS.has(t.taxExemptionCode) : t.taxExemptionCode in IVA_EXEMPTIONS;
      need(ok, `${q}.taxExemptionCode`, "obrigatório e tem de constar das Tabelas 4, 5 ou 6");
      need(t.taxPercentage === 0, `${q}.taxPercentage`, "tem de ser 0 em isenção/não sujeição");
    } else need(t.taxExemptionCode === undefined, `${q}.taxExemptionCode`, "só com isenção (ISE) ou NS");
  });
}
