import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { addDays, balanceDue, deriveInvoiceStatus } from "@/lib/invoice-calc";
import { D } from "@/lib/money";
import { formatDocumentNumber, sequenceKey } from "@/lib/numbering";
import { planCreditNote, type RequestedCreditLine } from "@/lib/credit-note";
import { buildSnapshot } from "@/lib/snapshot";

/**
 * Shared, transaction-scoped fiscal workflow: issue, void and credit note.
 * Callers must run these inside a `Serializable` transaction (see `retryOnConflict`),
 * so concurrent edits, payments and issuance cannot interleave.
 */
type Tx = Prisma.TransactionClient;

export type WorkflowErrorCode =
  | "NOT_FOUND" | "NOT_DRAFT" | "EMPTY_INVOICE" | "NOT_VOIDABLE" | "HAS_PAYMENTS" | "HAS_CREDIT_NOTES"
  | "NOT_CREDITABLE" | "CREDIT_NOTE_INVALID";

export class WorkflowError extends Error {
  constructor(public code: WorkflowErrorCode, message: string) {
    super(message);
  }
}

/** Unguessable token (192 bits) for public document links. */
export const newPublicToken = () => randomBytes(24).toString("base64url");
/** Tokens created by the old `cuid()` default are shorter and must not be used for public links. */
export const isStrongPublicToken = (token: string) => token.length >= 32;

export async function allocateNumber(
  tx: Tx, organizationId: string, kind: "invoice" | "credit_note", prefix: string, now: Date,
): Promise<string> {
  const year = now.getUTCFullYear();
  const key = sequenceKey(kind, year);
  const sequence = await tx.numberSequence.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, next: 2 },
    update: { next: { increment: 1 } },
  });
  return formatDocumentNumber(prefix, year, sequence.next - 1);
}

async function adjustStock(
  tx: Tx, organizationId: string, lines: Array<{ productId: string | null; quantity: unknown }>, direction: "decrement" | "increment",
) {
  const totals = new Map<string, ReturnType<typeof D>>();
  for (const line of lines) {
    if (!line.productId) continue;
    totals.set(line.productId, (totals.get(line.productId) ?? D(0)).add(D(line.quantity as string)));
  }
  for (const [productId, quantity] of totals) {
    await tx.product.updateMany({
      where: { id: productId, organizationId, trackStock: true },
      data: { stockQty: { [direction]: quantity.toString() } },
    });
  }
}

export async function issueDraftInvoice(tx: Tx, input: { invoiceId: string; organizationId: string; userId: string | null; now?: Date }) {
  const { invoiceId, organizationId, userId } = input;
  const draft = await tx.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { lines: { orderBy: { position: "asc" } }, organization: true, client: true },
  });
  if (!draft) throw new WorkflowError("NOT_FOUND", "Factura não encontrada.");
  if (draft.status !== "DRAFT" || draft.type !== "INVOICE") throw new WorkflowError("NOT_DRAFT", "Esta factura já foi emitida ou não está em rascunho.");
  if (!draft.lines.length || D(draft.total).lte(0)) throw new WorkflowError("EMPTY_INVOICE", "A factura precisa de linhas e total superior a zero.");

  const now = input.now ?? new Date();
  const number = await allocateNumber(tx, organizationId, "invoice", draft.organization.invoicePrefix, now);
  const dueDate = addDays(now, draft.paymentTermsDays);
  const snapshot = buildSnapshot({
    kind: "INVOICE", number, issueDate: now, dueDate, currency: draft.currency,
    organization: draft.organization, client: draft.client, lines: draft.lines,
    subtotal: draft.subtotal, discountTotal: draft.discountTotal, taxTotal: draft.taxTotal,
    withholdingRate: draft.withholdingRate, withholdingTotal: draft.withholdingTotal, total: draft.total,
    notes: draft.notes, terms: draft.terms,
  });
  await adjustStock(tx, organizationId, draft.lines, "decrement");

  // `status: "DRAFT"` in the filter makes the transition atomic even without Serializable.
  const updated = await tx.invoice.updateMany({
    where: { id: invoiceId, organizationId, status: "DRAFT" },
    data: { number, status: "ISSUED", issueDate: now, dueDate, snapshot: snapshot as unknown as Prisma.InputJsonValue, publicToken: newPublicToken() },
  });
  if (updated.count !== 1) throw new WorkflowError("NOT_DRAFT", "Esta factura já foi emitida ou não está em rascunho.");
  await tx.invoiceEvent.create({ data: { invoiceId, userId, action: "issued", data: { number, contentHash: snapshot.contentHash } } });
  return { id: invoiceId, number, status: "ISSUED" as const, issueDate: now, dueDate, total: draft.total, currency: draft.currency };
}

export async function voidIssuedInvoice(tx: Tx, input: { invoiceId: string; organizationId: string; userId: string | null; reason: string }) {
  const { invoiceId, organizationId, userId, reason } = input;
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: { lines: true } });
  if (!invoice) throw new WorkflowError("NOT_FOUND", "Factura não encontrada.");
  if (invoice.type !== "INVOICE" || !["ISSUED", "OVERDUE"].includes(invoice.status)) {
    throw new WorkflowError("NOT_VOIDABLE", "Só é possível anular facturas emitidas e sem recebimentos. Facturas pagas devem ser corrigidas com uma nota de crédito.");
  }
  const [payments, creditNotes] = await Promise.all([
    tx.payment.count({ where: { invoiceId, organizationId, status: "CONFIRMED" } }),
    tx.invoice.count({ where: { creditedInvoiceId: invoiceId, organizationId } }),
  ]);
  if (payments > 0 || D(invoice.amountPaid).gt(0)) throw new WorkflowError("HAS_PAYMENTS", "A factura tem recebimentos registados. Emite uma nota de crédito em vez de a anular.");
  if (creditNotes > 0) throw new WorkflowError("HAS_CREDIT_NOTES", "A factura já tem notas de crédito associadas.");

  const now = new Date();
  const updated = await tx.invoice.updateMany({
    where: { id: invoiceId, organizationId, status: { in: ["ISSUED", "OVERDUE"] } },
    data: { status: "VOID", voidedAt: now, voidReason: reason },
  });
  if (updated.count !== 1) throw new WorkflowError("NOT_VOIDABLE", "A factura mudou de estado entretanto. Tenta novamente.");
  await adjustStock(tx, organizationId, invoice.lines, "increment");
  await tx.invoiceEvent.create({ data: { invoiceId, userId, action: "voided", data: { reason } } });
  return { id: invoiceId, status: "VOID" as const, voidedAt: now };
}

export async function createCreditNote(
  tx: Tx,
  input: { invoiceId: string; organizationId: string; userId: string | null; reason: string; lines?: RequestedCreditLine[] | null },
) {
  const { invoiceId, organizationId, userId, reason } = input;
  const original = await tx.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { lines: { orderBy: { position: "asc" } }, organization: true, client: true },
  });
  if (!original) throw new WorkflowError("NOT_FOUND", "Factura não encontrada.");
  if (original.type !== "INVOICE" || !["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(original.status) || !original.number) {
    throw new WorkflowError("NOT_CREDITABLE", "Só é possível emitir notas de crédito sobre facturas emitidas e não anuladas.");
  }
  const credited = await tx.invoice.aggregate({
    where: { creditedInvoiceId: invoiceId, organizationId, type: "CREDIT_NOTE" }, _sum: { total: true },
  });

  let plan;
  try {
    plan = planCreditNote({
      originalLines: original.lines, requested: input.lines, withholdingRate: original.withholdingRate,
      originalTotal: original.total, alreadyCredited: credited._sum.total ?? 0,
    });
  } catch (error) {
    throw new WorkflowError("CREDIT_NOTE_INVALID", error instanceof Error ? error.message : "Nota de crédito inválida.");
  }

  const now = new Date();
  const number = await allocateNumber(tx, organizationId, "credit_note", original.organization.creditNotePrefix, now);
  const snapshot = buildSnapshot({
    kind: "CREDIT_NOTE", number, issueDate: now, dueDate: null, currency: original.currency,
    organization: original.organization, client: original.client, lines: plan.lines,
    subtotal: plan.totals.subtotal.toFixed(2), discountTotal: plan.totals.discountTotal.toFixed(2),
    taxTotal: plan.totals.taxTotal.toFixed(2), withholdingRate: original.withholdingRate,
    withholdingTotal: plan.totals.withholdingTotal.toFixed(2), total: plan.totals.total.toFixed(2),
    notes: original.notes, terms: original.terms, creditedInvoiceNumber: original.number, reason,
  });

  const creditNote = await tx.invoice.create({
    data: {
      organizationId, clientId: original.clientId, type: "CREDIT_NOTE", creditedInvoiceId: original.id, number,
      // A credit note is settled by construction: it carries no receivable of its own.
      status: "PAID", currency: original.currency, exchangeRate: original.exchangeRate, issueDate: now, dueDate: null,
      paymentTermsDays: 0, subtotal: plan.totals.subtotal.toFixed(2), discountTotal: plan.totals.discountTotal.toFixed(2),
      taxTotal: plan.totals.taxTotal.toFixed(2), withholdingRate: original.withholdingRate,
      withholdingTotal: plan.totals.withholdingTotal.toFixed(2), total: plan.totals.total.toFixed(2),
      amountPaid: plan.totals.total.toFixed(2), notes: original.notes, terms: original.terms,
      snapshot: snapshot as unknown as Prisma.InputJsonValue, publicToken: newPublicToken(), createdById: userId,
      lines: { create: plan.lines.map(({ taxName, ...line }) => ({ ...line, taxName })) },
      events: { create: { userId, action: "credit_note_issued", data: { creditedInvoice: original.number, reason } } },
    },
    select: { id: true, number: true, status: true, type: true, total: true, currency: true, issueDate: true },
  });

  // Apply the credit to the original invoice's open balance (never beyond it; any excess is a refund due).
  const open = balanceDue(original.total, original.amountPaid);
  const applied = plan.totals.total.gt(open) ? open : plan.totals.total;
  const nextPaid = D(original.amountPaid).add(applied);
  const nextStatus = deriveInvoiceStatus({ current: original.status, total: original.total, amountPaid: nextPaid, dueDate: original.dueDate });
  await tx.invoice.update({
    where: { id: original.id },
    data: {
      amountPaid: nextPaid.toFixed(2), status: nextStatus,
      events: { create: { userId, action: "credit_note_applied", data: { creditNote: number, applied: applied.toFixed(2), refundDue: plan.totals.total.sub(applied).toFixed(2) } } },
    },
  });
  return { creditNote, applied: applied.toFixed(2), refundDue: plan.totals.total.sub(applied).toFixed(2), originalStatus: nextStatus };
}
