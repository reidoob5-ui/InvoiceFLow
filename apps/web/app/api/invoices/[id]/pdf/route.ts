import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!current.membership) return NextResponse.json({ error: "Selecciona uma empresa." }, { status: 409 });
  try { assertCan(current.membership.role, "invoices:read"); } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    throw error;
  }
  const { id } = await context.params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: current.membership.organizationId },
    include: { client: true, organization: true, lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Factura não encontrada." }, { status: 404 });
  const pdf = await renderInvoicePdf(invoice);
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoice.number || "invoice"}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
