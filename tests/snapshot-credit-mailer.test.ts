import { describe, expect, it } from "vitest";
import { buildSnapshot, canonicalJson, parseSnapshot, snapshotToPdfDocument, verifySnapshot } from "@/lib/snapshot";
import { CreditNoteError, planCreditNote, type OriginalLine } from "@/lib/credit-note";
import { computeTotals } from "@/lib/invoice-calc";
import { renderDocumentPdf } from "@/lib/pdf/document-pdf";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { isStrongPublicToken, newPublicToken } from "@/lib/document-workflow";

const org = {
  name: "Empresa", legalName: "Empresa Lda", taxId: "5400000000", addressLine1: "Rua A", addressLine2: null, city: "Luanda",
  country: "AO", email: "a@e.ao", phone: null, locale: "pt", brandColor: "#6366f1", logoDataUrl: null,
};
const client = { name: "Cliente", company: "Cliente SA", taxId: "123", addressLine1: "Av B", addressLine2: null, city: "Luanda", country: "AO", email: "c@c.ao", phone: null };
const lines = [{ description: "Consultoria", quantity: "2", unitPrice: "100", discountPercent: "10", taxRate: "14", taxName: "IVA", lineTotal: "180.00" }];
const make = (over: Partial<Parameters<typeof buildSnapshot>[0]> = {}) => buildSnapshot({
  kind: "INVOICE", number: "INV-2026-0001", issueDate: new Date("2026-11-19T10:00:00Z"), dueDate: new Date("2026-12-19T10:00:00Z"),
  currency: "AOA", organization: org, client, lines, subtotal: "180.00", discountTotal: "20.00", taxTotal: "25.20",
  withholdingRate: "0", withholdingTotal: "0.00", total: "205.20", notes: "n", terms: "t", ...over,
});

describe("document snapshot", () => {
  it("freezes seller and buyer as they were at issue time", () => {
    const snapshot = make();
    expect(snapshot.seller.name).toBe("Empresa Lda");
    expect(snapshot.buyer.name).toBe("Cliente SA");
    // Mutating the live objects afterwards must not reach the snapshot (it is a copy, not a reference).
    org.legalName = "Outro Nome"; client.company = "Outro Cliente";
    expect(snapshot.seller.name).toBe("Empresa Lda");
    expect(snapshot.buyer.name).toBe("Cliente SA");
    org.legalName = "Empresa Lda"; client.company = "Cliente SA";
  });

  it("detects tampering through the content hash", () => {
    const snapshot = make();
    expect(verifySnapshot(snapshot)).toBe(true);
    expect(verifySnapshot({ ...snapshot, total: "1.00" })).toBe(false);
    expect(verifySnapshot({ ...snapshot, buyer: { ...snapshot.buyer, taxId: "999" } })).toBe(false);
    expect(verifySnapshot({ ...snapshot, items: [{ ...snapshot.items[0], quantity: "3" }] })).toBe(false);
  });

  it("hashes independently of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("survives a JSON round trip (as stored in the JSONB column)", () => {
    const stored = JSON.parse(JSON.stringify(make()));
    const parsed = parseSnapshot(stored)!;
    expect(parsed).not.toBeNull();
    expect(verifySnapshot(parsed)).toBe(true);
  });

  it("rejects unknown or malformed JSON instead of trusting it", () => {
    for (const bad of [null, "x", [], {}, { version: 2, number: "1", items: [], contentHash: "x" }, { version: 1, number: 5 }]) {
      expect(parseSnapshot(bad)).toBeNull();
    }
  });

  it("renders a PDF from the snapshot with live payment state only", async () => {
    const doc = snapshotToPdfDocument(make(), { status: "PAID", amountPaid: "205.20", balanceDue: "0.00" });
    expect(doc.seller.name).toBe("Empresa Lda");
    expect(doc.status).toBe("PAID");
    expect((await renderDocumentPdf(doc)).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("credit note planning", () => {
  const original: OriginalLine[] = [
    { id: "l1", productId: null, description: "A", quantity: "2", unitPrice: "100.00", discountPercent: "10", taxRate: "14", taxName: "IVA" },
    { id: "l2", productId: "p1", description: "B", quantity: "1", unitPrice: "50.00", discountPercent: "0", taxRate: "0", taxName: null },
  ];
  const originalTotals = computeTotals(original.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxRate: l.taxRate })), { withholdingRate: 5 });
  const base = { originalLines: original, withholdingRate: 5, originalTotal: originalTotals.total, alreadyCredited: 0 };

  it("a full credit note reverses exactly the original total", () => {
    const plan = planCreditNote(base);
    expect(plan.totals.total.toFixed(2)).toBe(originalTotals.total.toFixed(2));
    expect(plan.lines).toHaveLength(2);
  });

  it("supports partial quantities", () => {
    const plan = planCreditNote({ ...base, requested: [{ lineId: "l1", quantity: "1" }] });
    expect(plan.lines).toHaveLength(1);
    expect(plan.totals.total.lt(originalTotals.total)).toBe(true);
  });

  it("refuses quantities above the invoice, unknown/duplicate lines and zero", () => {
    const fail = (requested: Array<{ lineId: string; quantity: string }>) => expect(() => planCreditNote({ ...base, requested })).toThrow(CreditNoteError);
    fail([{ lineId: "l1", quantity: "3" }]);
    fail([{ lineId: "nope", quantity: "1" }]);
    fail([{ lineId: "l1", quantity: "1" }, { lineId: "l1", quantity: "1" }]);
    fail([{ lineId: "l1", quantity: "0" }]);
  });

  it("never lets cumulative credit exceed the invoice total", () => {
    expect(() => planCreditNote({ ...base, alreadyCredited: "1" })).toThrowError(/exceder/);
    const half = planCreditNote({ ...base, requested: [{ lineId: "l2", quantity: "1" }] });
    expect(() => planCreditNote({ ...base, alreadyCredited: originalTotals.total.sub(half.totals.total).add("0.01").toString(), requested: [{ lineId: "l2", quantity: "1" }] })).toThrow(CreditNoteError);
  });
});

describe("mailer", () => {
  it("reports not-configured instead of throwing", async () => {
    expect(mailerConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(await sendMail({ to: "a@b.c", subject: "s", text: "t" }, {} as NodeJS.ProcessEnv)).toEqual({ sent: false, reason: "SMTP_NOT_CONFIGURED" });
  });
});

describe("public tokens", () => {
  it("are long and random, and legacy cuid-length tokens are rejected", () => {
    const a = newPublicToken(); const b = newPublicToken();
    expect(a).not.toBe(b);
    expect(isStrongPublicToken(a)).toBe(true);
    expect(isStrongPublicToken("cmhxy1234abcd5678efgh9012")).toBe(false); // 25 chars, old cuid()
  });
});
