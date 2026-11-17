import { describe, expect, it } from "vitest";
import { renderDocumentPdf, type PdfDocument } from "@/lib/pdf/document-pdf";
import { renderTemplate, escapeHtml, textToHtmlEmail, DEFAULT_TEMPLATES } from "@/lib/email-templates";
import { genericProvider } from "@/lib/payments/providers";
import { signWebhook } from "@/lib/auth/tokens";

const baseDoc = (over: Partial<PdfDocument> = {}): PdfDocument => ({
  kind: "INVOICE", number: "INV-2026-0001", status: "ISSUED", locale: "pt", currency: "AOA",
  issueDate: new Date("2026-11-17"), dueDate: new Date("2026-12-17"), brandColor: "#6366f1",
  seller: { name: "Empresa Lda", taxId: "5400000000", lines: ["Rua A, Luanda", "Angola"] },
  buyer: { name: "Cliente SA", taxId: null, lines: ["Av. B"] },
  items: [{ description: "Consultoria", quantity: "2", unitPrice: "100.00", discountPercent: "10", taxRate: "14", lineTotal: "180.00" }],
  subtotal: "180.00", discountTotal: "20.00", taxTotal: "25.20", withholdingTotal: "0", total: "205.20",
  amountPaid: "100.00", balanceDue: "105.20", notes: "Obrigado", terms: "30 dias", ...over,
});

describe("pdf", () => {
  it("renders a valid PDF", async () => {
    const buf = await renderDocumentPdf(baseDoc());
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.subarray(-6).toString()).toContain("%%EOF");
    expect(buf.length).toBeGreaterThan(1500);
  });
  it("paginates long documents without throwing", async () => {
    const items = Array.from({ length: 80 }, (_, i) => ({ description: `Linha ${i} com descrição razoavelmente longa para forçar quebra`, quantity: "1", unitPrice: "10.00", discountPercent: "0", taxRate: "14", lineTotal: "10.00" }));
    const buf = await renderDocumentPdf(baseDoc({ items }));
    const pages = (buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
  it("tolerates a bad logo and an invalid brand colour", async () => {
    const buf = await renderDocumentPdf(baseDoc({ logoDataUrl: "data:image/png;base64,AAAA", brandColor: "javascript:alert(1)" }));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("supports credit notes and quotes in other languages", async () => {
    for (const [kind, locale] of [["CREDIT_NOTE", "fr"], ["QUOTE", "es"], ["QUOTE", "en"]] as const) {
      expect((await renderDocumentPdf(baseDoc({ kind, locale }))).length).toBeGreaterThan(1000);
    }
  });
});

describe("email templates", () => {
  it("substitutes variables and escapes HTML in html mode", () => {
    const out = renderTemplate("Olá {{client}} — {{ total }}", { client: "<b>Ana</b>", total: 10 }, true);
    expect(out).toBe("Olá &lt;b&gt;Ana&lt;/b&gt; — 10");
    expect(renderTemplate("Olá {{client}}", { client: "A&B" })).toBe("Olá A&B");
    expect(renderTemplate("x{{missing}}y", {})).toBe("xy");
  });
  it("builds a safe html shell", () => {
    const html = textToHtmlEmail("Olá <script>alert(1)</script>\n\nSegundo", "bad");
    expect(html).not.toContain("<script>");
    expect(html).toContain("#6366f1");
    expect(escapeHtml(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });
  it("ships the default templates", () => {
    for (const k of ["invoice_send", "payment_reminder", "payment_received", "quote_send", "user_invite", "verify_email", "reset_password"]) {
      expect(DEFAULT_TEMPLATES[k].subject.length).toBeGreaterThan(3);
    }
  });
});

describe("generic payment provider webhook", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "tx_1", status: "succeeded", amount: "150.00", currency: "AOA", invoice: "INV-2026-0001" });
  const headers = (sig: string) => new Headers({ "x-invoiceflow-signature": sig });

  it("accepts an authentic event", () => {
    const ev = genericProvider.parseWebhook(body, headers(signWebhook(secret, body)), secret);
    expect(ev).toMatchObject({ providerRef: "tx_1", status: "succeeded", amount: "150.00", currency: "AOA", invoiceRef: "INV-2026-0001" });
  });
  it("rejects bad signatures, stale signatures and tampered bodies", () => {
    expect(genericProvider.parseWebhook(body, headers(signWebhook("wrong", body)), secret)).toBeNull();
    expect(genericProvider.parseWebhook(body, headers(signWebhook(secret, body, 1000)), secret)).toBeNull();
    expect(genericProvider.parseWebhook(body.replace("150.00", "1.00"), headers(signWebhook(secret, body)), secret)).toBeNull();
    expect(genericProvider.parseWebhook(body, new Headers(), secret)).toBeNull();
  });
  it("rejects malformed payloads even when correctly signed", () => {
    for (const bad of [
      "not json",
      JSON.stringify({ id: "x", status: "weird", amount: "1.00", currency: "AOA" }),
      JSON.stringify({ id: "x", status: "succeeded", amount: "-5", currency: "AOA" }),
      JSON.stringify({ id: "x", status: "succeeded", amount: "1.00", currency: "aoa" }),
    ]) {
      expect(genericProvider.parseWebhook(bad, headers(signWebhook(secret, bad)), secret)).toBeNull();
    }
  });
});
