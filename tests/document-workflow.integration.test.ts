import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { retryOnConflict } from "@/lib/tx-retry";
import { createCreditNote, issueDraftInvoice, voidIssuedInvoice, WorkflowError } from "@/lib/document-workflow";
import { parseSnapshot, verifySnapshot } from "@/lib/snapshot";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

/**
 * Runs against a REAL PostgreSQL (migrations applied). Opt in with INTEGRATION_DB=1, e.g.
 *   INTEGRATION_DB=1 DATABASE_URL=postgresql://... npx vitest run tests/document-workflow.integration.test.ts
 */
const run = process.env.INTEGRATION_DB === "1";
const serializable = { isolationLevel: "Serializable" as const };
const tx = <T>(fn: (t: Prisma.TransactionClient) => Promise<T>) =>
  retryOnConflict(() => prisma.$transaction(fn, serializable));

describe.skipIf(!run)("fiscal document workflow (real PostgreSQL)", () => {
  const suffix = randomBytes(4).toString("hex");
  let orgA: string; let orgB: string; let clientA: string; let productId: string; let userId: string;

  async function draft(organizationId = orgA, clientId = clientA, qty = "2") {
    return prisma.invoice.create({
      data: {
        organizationId, clientId, status: "DRAFT", subtotal: "200.00", taxTotal: "28.00", total: "228.00", paymentTermsDays: 30,
        lines: { create: [{ productId, position: 0, description: "Item", quantity: qty, unitPrice: "100.00", discountPercent: "0", taxRate: "14", taxName: "IVA", lineTotal: "200.00" }] },
      },
    });
  }
  const issue = (invoiceId: string, organizationId = orgA) => tx((t) => issueDraftInvoice(t, { invoiceId, organizationId, userId }));
  const stock = async () => Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty);

  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `wf-${suffix}@test.local` } })).id;
    orgA = (await prisma.organization.create({ data: { name: "Org A", legalName: "Org A Lda", slug: `wf-a-${suffix}`, taxId: "111" } })).id;
    orgB = (await prisma.organization.create({ data: { name: "Org B", slug: `wf-b-${suffix}` } })).id;
    clientA = (await prisma.client.create({ data: { organizationId: orgA, name: "Cliente", company: "Cliente Original SA", taxId: "999", email: "c@c.ao" } })).id;
    productId = (await prisma.product.create({ data: { organizationId: orgA, name: "Prod", unitPrice: "100", trackStock: true, stockQty: "10" } })).id;
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("issues: allocates a number, writes a verifiable snapshot, decrements stock, rotates to a strong token", async () => {
    const before = await stock();
    const d = await draft();
    const issued = await issue(d.id);
    expect(issued.number).toMatch(/^INV-\d{4}-0001$|^INV-\d{4}-\d+$/);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe("ISSUED");
    const snap = parseSnapshot(row.snapshot)!;
    expect(snap).not.toBeNull();
    expect(verifySnapshot(snap)).toBe(true);
    expect(snap.number).toBe(issued.number);
    expect(row.publicToken.length).toBeGreaterThanOrEqual(32);
    expect(await stock()).toBe(before - 2);
  });

  it("an issued document is NOT changed by later edits to the client (the reported bug)", async () => {
    const d = await draft();
    await issue(d.id);
    await prisma.client.update({ where: { id: clientA }, data: { company: "Nome Alterado Depois", taxId: "000" } });
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: d.id }, include: { client: true, organization: true, lines: true } });
    const pdf = await renderInvoicePdf(row);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const snap = parseSnapshot(row.snapshot)!;
    expect(snap.buyer.name).toBe("Cliente Original SA");
    expect(snap.buyer.taxId).toBe("999");
    expect(row.client.company).toBe("Nome Alterado Depois"); // live data moved on; the document did not
    await prisma.client.update({ where: { id: clientA }, data: { company: "Cliente Original SA", taxId: "999" } });
  });

  it("refuses to issue twice and cannot issue another organization's draft", async () => {
    const d = await draft();
    await issue(d.id);
    await expect(issue(d.id)).rejects.toMatchObject({ code: "NOT_DRAFT" });
    const other = await draft();
    await expect(issue(other.id, orgB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("DRAFT");
  });

  it("concurrent issues of the SAME draft: exactly one wins, stock drops once", async () => {
    const before = await stock();
    const d = await draft();
    const results = await Promise.allSettled([issue(d.id), issue(d.id), issue(d.id), issue(d.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(WorkflowError);
    expect(await stock()).toBe(before - 2);
  });

  it("concurrent issues of DIFFERENT drafts get unique, gap-free numbers", async () => {
    const drafts = await Promise.all([1, 2, 3, 4, 5, 6].map(() => draft(orgA, clientA, "1")));
    const issued = await Promise.all(drafts.map((d) => issue(d.id)));
    const numbers = issued.map((i) => i.number);
    expect(new Set(numbers).size).toBe(6);
    const seq = numbers.map((n) => Number(n.split("-").pop())).sort((a, b) => a - b);
    for (let i = 1; i < seq.length; i++) expect(seq[i] - seq[i - 1]).toBe(1);
  });

  it("the PATCH race: an edit racing an issue can never rewrite an issued invoice", async () => {
    const d = await draft();
    // Same shape as PATCH /api/invoices/[id] after the fix: status check + rewrite inside one Serializable tx.
    const edit = () => tx(async (t) => {
      const cur = await t.invoice.findFirst({ where: { id: d.id, organizationId: orgA }, select: { status: true } });
      if (!cur || cur.status !== "DRAFT") return { edited: false };
      await t.invoiceLine.deleteMany({ where: { invoiceId: d.id } });
      await t.invoice.update({ where: { id: d.id }, data: { total: "1.00", subtotal: "1.00", taxTotal: "0.00", lines: { create: [{ position: 0, description: "HACK", quantity: "1", unitPrice: "1.00", discountPercent: "0", taxRate: "0", lineTotal: "1.00" }] } } });
      return { edited: true };
    });
    await Promise.allSettled([issue(d.id), edit(), edit()]);
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: d.id }, include: { lines: true } });
    expect(row.status).toBe("ISSUED");
    const snap = parseSnapshot(row.snapshot)!;
    // Whatever interleaving happened, the issued rows must agree with the frozen snapshot.
    expect(String(row.total)).toBe(snap.total);
    expect(row.lines.map((l) => l.description)).toEqual(snap.items.map((i) => i.description));
  });

  it("the database itself refuses to alter an issued document (defence in depth)", async () => {
    const d = await draft();
    await issue(d.id);
    await expect(prisma.invoice.update({ where: { id: d.id }, data: { total: "1.00" } })).rejects.toThrow(/immutable/);
    await expect(prisma.invoice.update({ where: { id: d.id }, data: { number: "HACK" } })).rejects.toThrow(/immutable/);
    await expect(prisma.invoiceLine.updateMany({ where: { invoiceId: d.id }, data: { description: "HACK" } })).rejects.toThrow(/immutable/);
    await expect(prisma.invoiceLine.deleteMany({ where: { invoiceId: d.id } })).rejects.toThrow(/immutable/);
    // ...while normal bookkeeping still works.
    await prisma.invoice.update({ where: { id: d.id }, data: { amountPaid: "10.00", status: "PARTIALLY_PAID" } });
  });

  it("voids an unpaid invoice (restoring stock) and refuses when payments or credit notes exist", async () => {
    const before = await stock();
    const d = await draft();
    await issue(d.id);
    expect(await stock()).toBe(before - 2);
    const voided = await tx((t) => voidIssuedInvoice(t, { invoiceId: d.id, organizationId: orgA, userId, reason: "Erro de emissão" }));
    expect(voided.status).toBe("VOID");
    expect(await stock()).toBe(before);
    await expect(tx((t) => voidIssuedInvoice(t, { invoiceId: d.id, organizationId: orgA, userId, reason: "again" }))).rejects.toMatchObject({ code: "NOT_VOIDABLE" });

    const paid = await draft(); await issue(paid.id);
    await prisma.payment.create({ data: { organizationId: orgA, invoiceId: paid.id, clientId: clientA, amount: "50.00", currency: "AOA", status: "CONFIRMED", method: "CASH" } });
    await prisma.invoice.update({ where: { id: paid.id }, data: { amountPaid: "50.00", status: "PARTIALLY_PAID" } });
    // Partially paid is not voidable by status alone; the payment guard is what protects it.
    await expect(tx((t) => voidIssuedInvoice(t, { invoiceId: paid.id, organizationId: orgA, userId, reason: "nope" }))).rejects.toBeInstanceOf(WorkflowError);

    // Even an ISSUED invoice that somehow has a confirmed payment must be refused (HAS_PAYMENTS).
    const sneaky = await draft(); await issue(sneaky.id);
    await prisma.payment.create({ data: { organizationId: orgA, invoiceId: sneaky.id, clientId: clientA, amount: "10.00", currency: "AOA", status: "CONFIRMED", method: "CASH" } });
    await expect(tx((t) => voidIssuedInvoice(t, { invoiceId: sneaky.id, organizationId: orgA, userId, reason: "nope" }))).rejects.toMatchObject({ code: "HAS_PAYMENTS" });

    // An invoice with a credit note cannot be voided either.
    const credited = await draft(); await issue(credited.id);
    const creditedLine = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: credited.id } });
    await tx((t) => createCreditNote(t, { invoiceId: credited.id, organizationId: orgA, userId, reason: "parcial", lines: [{ lineId: creditedLine.id, quantity: "1" }] }));
    await expect(tx((t) => voidIssuedInvoice(t, { invoiceId: credited.id, organizationId: orgA, userId, reason: "nope" }))).rejects.toBeInstanceOf(WorkflowError);
  });

  it("credit note: reverses the invoice, is numbered separately, settles the original, and cannot be over-issued", async () => {
    const d = await draft(); const issued = await issue(d.id);
    const full = await tx((t) => createCreditNote(t, { invoiceId: d.id, organizationId: orgA, userId, reason: "Devolução" }));
    expect(full.creditNote.number).toMatch(/^CN-/);
    expect(full.creditNote.number).not.toBe(issued.number);
    expect(full.originalStatus).toBe("PAID");
    expect(full.refundDue).toBe("0.00");
    const original = await prisma.invoice.findUniqueOrThrow({ where: { id: d.id } });
    expect(String(original.amountPaid)).toBe(String(original.total));
    const cn = await prisma.invoice.findUniqueOrThrow({ where: { id: full.creditNote.id } });
    expect(cn.type).toBe("CREDIT_NOTE");
    expect(verifySnapshot(parseSnapshot(cn.snapshot)!)).toBe(true);
    // A second full credit note would exceed the invoice total.
    await expect(tx((t) => createCreditNote(t, { invoiceId: d.id, organizationId: orgA, userId, reason: "duplicada" }))).rejects.toMatchObject({ code: "CREDIT_NOTE_INVALID" });
    // And a credit note cannot be credited.
    await expect(tx((t) => createCreditNote(t, { invoiceId: full.creditNote.id, organizationId: orgA, userId, reason: "x" }))).rejects.toMatchObject({ code: "NOT_CREDITABLE" });
  });

  it("concurrent credit notes cannot together exceed the invoice total", async () => {
    const d = await draft(); await issue(d.id);
    const attempts = await Promise.allSettled([1, 2, 3].map(() => tx((t) => createCreditNote(t, { invoiceId: d.id, organizationId: orgA, userId, reason: "corrida" }))));
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sum = await prisma.invoice.aggregate({ where: { creditedInvoiceId: d.id }, _sum: { total: true } });
    expect(Number(sum._sum.total)).toBe(228);
  });

  it("another organization cannot void or credit this organization's invoice", async () => {
    const d = await draft(); await issue(d.id);
    await expect(tx((t) => voidIssuedInvoice(t, { invoiceId: d.id, organizationId: orgB, userId, reason: "intruso" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(tx((t) => createCreditNote(t, { invoiceId: d.id, organizationId: orgB, userId, reason: "intruso" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
