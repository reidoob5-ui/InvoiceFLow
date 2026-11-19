import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStrongPublicToken } from "@/lib/document-workflow";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

/**
 * Public copy of an issued document, addressed by an unguessable token. Legacy short tokens
 * (the old `cuid()` default) are refused: they are rotated to a strong token the first time the
 * document is emailed.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const notFound = () => NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!isStrongPublicToken(token) || token.length > 128) return notFound();
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken: token },
    include: { client: true, organization: true, lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice || invoice.status === "DRAFT" || invoice.status === "VOID" || invoice.organization.status !== "ACTIVE") return notFound();
  await prisma.invoice.update({ where: { id: invoice.id }, data: { viewedAt: new Date(), viewCount: { increment: 1 } } });
  const pdf = await renderInvoicePdf(invoice);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoice.number ?? "documento"}.pdf"`,
      "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
    },
  });
}
