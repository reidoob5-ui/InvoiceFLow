import { describe, expect, it } from "vitest";
import { buildDocument, validateDocument, DocumentValidationError, type DocumentInput } from "@/lib/agt/document";
import { generateKeyPair, verifyJws, signJws } from "@/lib/agt/signing";
import { qrUrl, checkQrFitsVersion4 } from "@/lib/agt/qr";
import { allowedSeriesYears, formatDocumentNo, luandaParts, validateSeriesCode } from "@/lib/agt/series";

const keys = generateKeyPair();
const NIF = "5417012345";
const now = new Date("2026-11-14T10:00:00Z");
const ctx = (documentNo = "FT A2026/1", extra = {}) => ({ nif: NIF, companyName: "Empresa Exemplo, Lda", signingKey: keys.privateKey, documentNo, now, ...extra });
const line = (over = {}) => ({
  operationType: "SG", productCode: "P001", productDescription: "Consultoria", quantity: 1, unitPrice: "100",
  unitOfMeasure: "UN", tax: { taxType: "IVA", taxCode: "NOR" }, ...over,
});
const inv = (over: Partial<DocumentInput> = {}): DocumentInput => ({
  documentType: "FT", customer: { taxId: "5000123456" }, lines: [line()], ...over,
});

describe("AGT documento", () => {
  it("constrói FT válida e assinada (RS256, campos pela ordem do Anexo I)", () => {
    const d = buildDocument(inv(), ctx());
    expect(d.documentTotals).toEqual({ taxPayable: 14, netTotal: 100, grossTotal: 114 });
    expect(d.documentDate).toBe("2026-11-14");
    expect(d.systemEntryDate).toBe("2026-11-14T11:00:00");
    expect(d.lines[0].creditAmount).toBe(100);
    const v = verifyJws(d.jwsDocumentSignature, keys.publicKey);
    expect(v.valid).toBe(true);
    if (v.valid) expect(Object.keys(v.payload as object)).toEqual(["documentNo", "taxRegistrationNumber", "documentType", "documentDate", "customerTaxID", "customerCountry", "companyName", "documentTotals"]);
    expect(validateDocument(d)).toEqual([]);
  });

  it("consumidor final AO => NIF 999999999", () => {
    expect(buildDocument(inv({ customer: {} }), ctx()).customerTaxID).toBe("999999999");
  });

  it("NC usa debitAmount e exige referência", () => {
    expect(() => buildDocument(inv({ documentType: "NC" }), ctx("NC A2026/1"))).toThrow(DocumentValidationError);
    const d = buildDocument(inv({ documentType: "NC", lines: [line({ referenceInfo: { reference: "FT A2026/1" } })] }), ctx("NC A2026/1"));
    expect(d.lines[0].debitAmount).toBe(100);
    expect(d.lines[0].creditAmount).toBeUndefined();
  });

  it("recibo AR: sem linhas, com paymentReceipt, NC com sinal negativo", () => {
    const src = (documentNo: string, documentType: string, n: bigint) => ({ documentNo, documentType, documentDate: "2026-11-14", netCents: n, taxCents: n / 100n * 14n });
    const d = buildDocument({ documentType: "AR", customer: { taxId: "5000123456" } }, ctx("AR A2026/1", { sources: [src("FT A2026/1", "FT", 10000n), src("NC A2026/1", "NC", 2000n)] }));
    expect(d.lines).toBeUndefined();
    expect(d.documentTotals.netTotal).toBe(80);
    expect(() => buildDocument({ documentType: "AR" }, ctx("AR A2026/2"))).toThrow(/sem documentos de origem/);
  });

  it("anulado exige motivo; corrigido exige rejectedDocumentNo", () => {
    expect(() => buildDocument(inv({ documentStatus: "A" }), ctx())).toThrow(/documentCancelReason/);
    expect(() => buildDocument(inv({ documentStatus: "C" }), ctx())).toThrow(/rejectedDocumentNo/);
    expect(buildDocument(inv({ documentStatus: "C", rejectedDocumentNo: "FT A2026/1" }), ctx("FT A2026/2")).documentStatus).toBe("C");
  });

  it("moeda estrangeira e retenção", () => {
    const d = buildDocument(inv({ currency: { code: "USD", rate: "912.5" }, withholdingTaxList: [{ type: "IRT", amount: "6.5" }] }), ctx());
    expect(d.documentTotals.currency.currencyCode).toBe("USD");
    expect(d.withholdingTaxList[0].withholdingTaxAmount).toBe(6.5);
  });

  it("validador detecta totais adulterados", () => {
    const d = buildDocument(inv(), ctx());
    d.documentTotals.netTotal = 1;
    expect(validateDocument(d).length).toBeGreaterThan(0);
  });

  it("assinatura adulterada ou chave errada falha; RSA < 2048 recusada", () => {
    const d = buildDocument(inv(), ctx());
    expect(verifyJws(d.jwsDocumentSignature + "x", keys.publicKey).valid).toBe(false);
    expect(verifyJws(d.jwsDocumentSignature, generateKeyPair().publicKey).valid).toBe(false);
    expect(() => generateKeyPair(1024)).toThrow(/2048/);
    expect(() => signJws({}, "lixo")).toThrow();
  });

  it("séries: formato, datas e numeração", () => {
    expect(validateSeriesCode("LD6325S2042N", 2026)).toEqual([]);
    expect(validateSeriesCode("a!", 2026).length).toBe(1);
    expect(allowedSeriesYears("2026-12-15")).toEqual([2026]);
    expect(allowedSeriesYears("2026-12-16")).toEqual([2026, 2027]);
    expect(formatDocumentNo("FT", "A2026", 7)).toBe("FT A2026/7");
    expect(() => formatDocumentNo("XX", "A2026", 1)).toThrow();
    expect(luandaParts(new Date("2026-12-31T23:30:00Z")).date).toBe("2027-01-01");
  });

  it("QR: URL com %20 e verificação de versão", () => {
    expect(qrUrl("FT A2026/1", NIF)).toBe(`https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=${NIF}&document=FT%20A2026/1`);
    const c = checkQrFitsVersion4("FT A2026/1", NIF);
    expect(c.fits).toBe(false); // URL > 62 bytes: precisa de versão superior (ponto em aberto com a AGT)
    expect(c.minVersion).toBeGreaterThanOrEqual(6);
  });
});
