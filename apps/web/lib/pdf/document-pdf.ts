import PDFDocument from "pdfkit";
import { formatDate, formatMoney } from "../money";
import { t } from "../i18n";

// Plain data shape so the renderer has no dependency on the database layer and can be unit tested.
export type PdfDocument = {
  kind: "INVOICE" | "CREDIT_NOTE" | "QUOTE";
  number: string;
  status?: string;
  locale: string;
  currency: string;
  issueDate?: Date | null;
  dueDate?: Date | null;
  brandColor?: string;
  /** data: URL (PNG/JPEG) */
  logoDataUrl?: string | null;
  seller: { name: string; taxId?: string | null; lines: string[] };
  buyer: { name: string; taxId?: string | null; lines: string[] };
  items: { description: string; quantity: string; unitPrice: string; discountPercent: string; taxRate: string; lineTotal: string }[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  withholdingTotal: string;
  total: string;
  amountPaid?: string;
  balanceDue?: string;
  notes?: string | null;
  terms?: string | null;
};

const TITLES: Record<string, Record<PdfDocument["kind"], string>> = {
  pt: { INVOICE: "FACTURA", CREDIT_NOTE: "NOTA DE CRÉDITO", QUOTE: "ORÇAMENTO" },
  en: { INVOICE: "INVOICE", CREDIT_NOTE: "CREDIT NOTE", QUOTE: "QUOTE" },
  fr: { INVOICE: "FACTURE", CREDIT_NOTE: "AVOIR", QUOTE: "DEVIS" },
  es: { INVOICE: "FACTURA", CREDIT_NOTE: "NOTA DE CRÉDITO", QUOTE: "PRESUPUESTO" },
};

function safeColor(c: string | undefined): string {
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#6366f1";
}

function logoBuffer(dataUrl: string | null | undefined): Buffer | null {
  const m = dataUrl?.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
  return m ? Buffer.from(m[2], "base64") : null;
}

export function renderDocumentPdf(doc: PdfDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${doc.kind} ${doc.number}`, Producer: "InvoiceFlow" } });
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const brand = safeColor(doc.brandColor);
    const L = (key: string) => t(doc.locale, key);
    const money = (v: string) => formatMoney(v, doc.currency, doc.locale);
    const left = 48;
    const right = pdf.page.width - 48;
    const width = right - left;

    // Header
    const logo = logoBuffer(doc.logoDataUrl);
    if (logo) {
      try { pdf.image(logo, left, 44, { fit: [120, 48] }); } catch { /* unreadable logo: skip */ }
    }
    pdf.fillColor(brand).fontSize(22).font("Helvetica-Bold")
      .text((TITLES[doc.locale] ?? TITLES.pt)[doc.kind], left, 48, { width, align: "right" });
    pdf.fillColor("#111827").fontSize(11).font("Helvetica").text(doc.number, left, 76, { width, align: "right" });
    if (doc.status) pdf.fillColor("#6b7280").fontSize(9).text(L(`status.${doc.status}`), left, 92, { width, align: "right" });

    // Parties
    let y = 120;
    const party = (title: string, p: PdfDocument["seller"], x: number) => {
      pdf.fillColor("#6b7280").fontSize(8).font("Helvetica-Bold").text(title.toUpperCase(), x, y);
      pdf.fillColor("#111827").fontSize(11).font("Helvetica-Bold").text(p.name, x, y + 12, { width: width / 2 - 12 });
      pdf.font("Helvetica").fontSize(9).fillColor("#374151");
      const extra = [...(p.taxId ? [`NIF/Tax ID: ${p.taxId}`] : []), ...p.lines.filter(Boolean)];
      pdf.text(extra.join("\n"), x, pdf.y + 2, { width: width / 2 - 12 });
    };
    party("De", doc.seller, left);
    const afterSeller = pdf.y;
    pdf.y = y;
    party(L("common.client"), doc.buyer, left + width / 2);
    y = Math.max(afterSeller, pdf.y) + 14;

    // Dates
    pdf.fillColor("#374151").fontSize(9).font("Helvetica");
    pdf.text(`${L("common.date")}: ${formatDate(doc.issueDate, doc.locale)}`, left, y);
    if (doc.dueDate) pdf.text(`${L("invoice.due")}: ${formatDate(doc.dueDate, doc.locale)}`, left + width / 2, y);
    y += 24;

    // Table
    const cols = { desc: left, qty: left + width * 0.5, price: left + width * 0.6, disc: left + width * 0.74, tax: left + width * 0.82, total: left + width * 0.88 };
    const drawHeader = (yy: number) => {
      pdf.rect(left, yy, width, 20).fill(brand);
      pdf.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
      pdf.text("Descrição", cols.desc + 6, yy + 6);
      pdf.text("Qtd", cols.qty, yy + 6, { width: width * 0.1 - 6, align: "right" });
      pdf.text("Preço", cols.price, yy + 6, { width: width * 0.14 - 6, align: "right" });
      pdf.text("Desc.%", cols.disc, yy + 6, { width: width * 0.08 - 6, align: "right" });
      pdf.text("IVA%", cols.tax, yy + 6, { width: width * 0.06 - 6, align: "right" });
      pdf.text(L("common.total"), cols.total, yy + 6, { width: width * 0.12 - 6, align: "right" });
      return yy + 26;
    };
    y = drawHeader(y);
    pdf.font("Helvetica").fontSize(9).fillColor("#111827");
    for (const it of doc.items) {
      const h = Math.max(18, pdf.heightOfString(it.description, { width: width * 0.5 - 10 }) + 8);
      if (y + h > pdf.page.height - 160) {
        pdf.addPage();
        y = drawHeader(48);
        pdf.font("Helvetica").fontSize(9).fillColor("#111827");
      }
      pdf.text(it.description, cols.desc + 6, y, { width: width * 0.5 - 10 });
      pdf.text(it.quantity, cols.qty, y, { width: width * 0.1 - 6, align: "right" });
      pdf.text(money(it.unitPrice), cols.price, y, { width: width * 0.14 - 6, align: "right" });
      pdf.text(it.discountPercent, cols.disc, y, { width: width * 0.08 - 6, align: "right" });
      pdf.text(it.taxRate, cols.tax, y, { width: width * 0.06 - 6, align: "right" });
      pdf.text(money(it.lineTotal), cols.total, y, { width: width * 0.12 - 6, align: "right" });
      y += h;
      pdf.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    }

    // Totals
    y += 8;
    if (y > pdf.page.height - 170) { pdf.addPage(); y = 48; }
    const row = (label: string, value: string, bold = false) => {
      pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).fillColor("#111827");
      pdf.text(label, left + width * 0.55, y, { width: width * 0.22 });
      pdf.text(value, left + width * 0.77, y, { width: width * 0.23, align: "right" });
      y += bold ? 20 : 15;
    };
    row(L("invoice.subtotal"), money(doc.subtotal));
    if (Number(doc.discountTotal) > 0) row("Desconto", `- ${money(doc.discountTotal)}`);
    row(L("invoice.tax"), money(doc.taxTotal));
    if (Number(doc.withholdingTotal) > 0) row(L("invoice.withholding"), `- ${money(doc.withholdingTotal)}`);
    pdf.moveTo(left + width * 0.55, y - 2).lineTo(right, y - 2).strokeColor(brand).lineWidth(1).stroke();
    y += 4;
    row(L("common.total"), money(doc.total), true);
    if (doc.amountPaid && Number(doc.amountPaid) > 0) row("Pago", `- ${money(doc.amountPaid)}`);
    if (doc.balanceDue !== undefined) row(L("invoice.balance"), money(doc.balanceDue), true);

    // Notes
    y += 16;
    for (const [title, text] of [["Notas", doc.notes], ["Termos", doc.terms]] as const) {
      if (!text) continue;
      if (y > pdf.page.height - 90) { pdf.addPage(); y = 48; }
      pdf.fillColor("#6b7280").fontSize(8).font("Helvetica-Bold").text(title.toUpperCase(), left, y);
      pdf.fillColor("#374151").fontSize(9).font("Helvetica").text(text, left, y + 11, { width });
      y = pdf.y + 10;
    }

    pdf.fontSize(7).fillColor("#9ca3af").text("Gerado com InvoiceFlow", left, pdf.page.height - 36, { width, align: "center", lineBreak: false });
    pdf.end();
  });
}
