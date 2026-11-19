import nodemailer, { type Transporter } from "nodemailer";

export type MailAttachment = { filename: string; content: Buffer; contentType: string };
export type MailResult = { sent: true } | { sent: false; reason: "SMTP_NOT_CONFIGURED" | "SEND_FAILED"; detail?: string };

let cached: { key: string; transporter: Transporter } | null = null;

export function mailerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.SMTP_HOST && env.SMTP_FROM);
}

function transporter(env: NodeJS.ProcessEnv): Transporter {
  const port = Number(env.SMTP_PORT ?? 587);
  const key = `${env.SMTP_HOST}:${port}:${env.SMTP_USER ?? ""}`;
  if (cached?.key === key) return cached.transporter;
  const created = nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
    connectionTimeout: 10_000, socketTimeout: 20_000,
  });
  cached = { key, transporter: created };
  return created;
}

/** Strip line breaks so user-controlled text can never inject extra headers. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim().slice(0, 200);

export async function sendMail(
  message: { to: string; subject: string; text: string; html?: string; attachments?: MailAttachment[] },
  env: NodeJS.ProcessEnv = process.env,
): Promise<MailResult> {
  if (!mailerConfigured(env)) return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  try {
    await transporter(env).sendMail({
      from: env.SMTP_FROM, to: oneLine(message.to), subject: oneLine(message.subject),
      text: message.text, html: message.html, attachments: message.attachments,
    });
    return { sent: true };
  } catch (error) {
    // Log the failure server-side, but never echo SMTP internals (hosts, credentials) to the browser.
    console.error("[mailer]", error instanceof Error ? error.message : error);
    return { sent: false, reason: "SEND_FAILED" };
  }
}
