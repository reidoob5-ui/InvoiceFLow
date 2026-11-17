export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Substitute {{variable}} placeholders. Values are HTML-escaped; unknown variables render as empty text. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>, html = false): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    const s = v === null || v === undefined ? "" : String(v);
    return html ? escapeHtml(s) : s;
  });
}

export const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  invoice_send: {
    subject: "Factura {{number}} de {{company}}",
    body: "Olá {{client}},\n\nSegue a factura {{number}} no valor de {{total}}, com vencimento em {{dueDate}}.\n\nPode consultá-la e descarregá-la aqui: {{link}}\n\nObrigado,\n{{company}}",
  },
  payment_reminder: {
    subject: "Lembrete: factura {{number}} em aberto",
    body: "Olá {{client}},\n\nA factura {{number}} ({{balance}} em dívida) vence/venceu em {{dueDate}}.\n\nConsulte aqui: {{link}}\n\nSe já efectuou o pagamento, por favor ignore esta mensagem.\n\n{{company}}",
  },
  payment_received: {
    subject: "Pagamento recebido — {{number}}",
    body: "Olá {{client}},\n\nRecebemos o seu pagamento de {{amount}} referente à factura {{number}}. Obrigado!\n\n{{company}}",
  },
  quote_send: {
    subject: "Orçamento {{number}} de {{company}}",
    body: "Olá {{client}},\n\nSegue o orçamento {{number}} no valor de {{total}}, válido até {{validUntil}}.\n\nPode aceitá-lo ou rejeitá-lo aqui: {{link}}\n\n{{company}}",
  },
  user_invite: {
    subject: "Convite para {{company}} no InvoiceFlow",
    body: "Foi convidado(a) para se juntar a {{company}} com a função {{role}}.\n\nAceitar convite: {{link}}\n\nO convite expira em 7 dias.",
  },
  verify_email: {
    subject: "Confirme o seu e-mail",
    body: "Confirme o seu endereço de e-mail para activar a conta:\n\n{{link}}\n\nSe não criou esta conta, ignore esta mensagem.",
  },
  reset_password: {
    subject: "Recuperação de palavra-passe",
    body: "Recebemos um pedido para redefinir a sua palavra-passe:\n\n{{link}}\n\nO link expira em 1 hora. Se não foi você, ignore esta mensagem.",
  },
};

/** Wrap plain text in a minimal, accessible HTML email shell. */
export function textToHtmlEmail(text: string, brandColor = "#6366f1"): string {
  const paragraphs = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const safeBrand = /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : "#6366f1";
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827"><div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden"><div style="height:6px;background:${safeBrand}"></div><div style="padding:24px">${paragraphs}</div></div></body></html>`;
}
