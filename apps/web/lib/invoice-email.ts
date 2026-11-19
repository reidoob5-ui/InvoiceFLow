import { prisma } from "@/lib/db";
import { DEFAULT_TEMPLATES, renderTemplate, textToHtmlEmail } from "@/lib/email-templates";
import { isStrongPublicToken, newPublicToken } from "@/lib/document-workflow";
import { balanceDue } from "@/lib/invoice-calc";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { formatDate, formatMoney } from "@/lib/money";

export type SendInvoiceResult =
  | { sent: true }
  | { sent: false; reason: "NOT_FOUND" | "NOT_SENDABLE" | "NO_CLIENT_EMAIL" | "SMTP_NOT_CONFIGURED" | "SEND_FAILED" };

/**
 * Email an issued invoice (or a payment reminder) to the client, with the PDF attached and a
 * link to the public copy. Used by the "send" endpoint and by the daily job.
 */
export async function sendInvoiceEmail(input: {
  invoiceId: string; organizationId: string; userId: string | null; kind: "invoice_send" | "payment_reminder";
}): Promise<SendInvoiceResult> {
  const { invoiceId, organizationId, userId, kind } = input;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { client: true, organization: true, lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return { sent: false, reason: "NOT_FOUND" };
  if (!["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(invoice.status) || !invoice.number) return { sent: false, reason: "NOT_SENDABLE" };
  if (!invoice.client.email) return { sent: false, reason: "NO_CLIENT_EMAIL" };
  if (!mailerConfigured()) return { sent: false, reason: "SMTP_NOT_CONFIGURED" };

  // Invoices issued before unguessable tokens existed get a strong one before any public link is shared.
  let token = invoice.publicToken;
  if (!isStrongPublicToken(token)) {
    token = newPublicToken();
    await prisma.invoice.update({ where: { id: invoice.id }, data: { publicToken: token } });
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const link = appUrl ? `${appUrl}/api/public/invoices/${token}/pdf` : "(em anexo)";
  const custom = await prisma.emailTemplate.findUnique({ where: { organizationId_key: { organizationId, key: kind } } });
  const template = custom ?? DEFAULT_TEMPLATES[kind];
  const locale = invoice.organization.locale;
  const vars = {
    number: invoice.number, client: invoice.client.name, company: invoice.organization.name,
    total: formatMoney(invoice.total.toString(), invoice.currency, locale),
    balance: formatMoney(balanceDue(invoice.total, invoice.amountPaid).toString(), invoice.currency, locale),
    dueDate: formatDate(invoice.dueDate, locale, invoice.organization.timezone), link,
  };
  const text = renderTemplate(template.body, vars);
  const pdf = await renderInvoicePdf(invoice);

  const result = await sendMail({
    to: invoice.client.email, subject: renderTemplate(template.subject, vars), text,
    html: textToHtmlEmail(text, invoice.organization.brandColor),
    attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  if (!result.sent) return { sent: false, reason: result.reason === "SMTP_NOT_CONFIGURED" ? "SMTP_NOT_CONFIGURED" : "SEND_FAILED" };

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      ...(kind === "invoice_send" ? { sentAt: new Date() } : {}),
      events: { create: { userId, action: kind === "invoice_send" ? "sent" : "reminder_sent", data: { to: invoice.client.email } } },
    },
  });
  return { sent: true };
}
