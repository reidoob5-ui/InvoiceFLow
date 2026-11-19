import { createHash } from "node:crypto";
import type { PdfDocument } from "@/lib/pdf/document-pdf";

/**
 * Immutable issue-time snapshot of a fiscal document.
 *
 * Everything a reprint needs (seller, buyer, lines, totals, notes) is frozen when the
 * document is issued, so later edits to the client, the organization or the product
 * catalogue can never change an issued invoice. `contentHash` lets us detect tampering.
 */
export const SNAPSHOT_VERSION = 1;

export type SnapshotParty = { name: string; taxId: string | null; lines: string[] };
export type SnapshotItem = {
  description: string; quantity: string; unitPrice: string; discountPercent: string;
  taxRate: string; taxName: string | null; lineTotal: string;
};

export type DocumentSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  locale: string;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  brandColor: string;
  logoDataUrl: string | null;
  seller: SnapshotParty;
  buyer: SnapshotParty;
  items: SnapshotItem[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  withholdingRate: string;
  withholdingTotal: string;
  total: string;
  notes: string | null;
  terms: string | null;
  creditedInvoiceNumber: string | null;
  reason: string | null;
  contentHash: string;
};

type OrganizationInput = {
  name: string; legalName: string | null; taxId: string | null; addressLine1: string | null; addressLine2: string | null;
  city: string | null; country: string; email: string | null; phone: string | null;
  locale: string; brandColor: string; logoDataUrl: string | null;
};
type ClientInput = {
  name: string; company: string | null; taxId: string | null; addressLine1: string | null; addressLine2: string | null;
  city: string | null; country: string | null; email: string | null; phone: string | null;
};
type LineInput = {
  description: string; quantity: unknown; unitPrice: unknown; discountPercent: unknown;
  taxRate: unknown; taxName?: string | null; lineTotal: unknown;
};

const compact = (values: Array<string | null | undefined>) => values.filter((x): x is string => !!x);

export function sellerFromOrganization(org: OrganizationInput): SnapshotParty {
  return {
    name: org.legalName || org.name, taxId: org.taxId,
    lines: compact([org.addressLine1, org.addressLine2, org.city, org.country, org.email, org.phone]),
  };
}

export function buyerFromClient(client: ClientInput): SnapshotParty {
  return {
    name: client.company || client.name, taxId: client.taxId,
    lines: compact([client.addressLine1, client.addressLine2, client.city, client.country, client.email, client.phone]),
  };
}

/** JSON with recursively sorted keys, so the hash does not depend on property order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashSnapshotContent(snapshot: Omit<DocumentSnapshot, "contentHash">): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

export function buildSnapshot(input: {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  organization: OrganizationInput;
  client: ClientInput;
  lines: LineInput[];
  subtotal: unknown; discountTotal: unknown; taxTotal: unknown;
  withholdingRate: unknown; withholdingTotal: unknown; total: unknown;
  notes: string | null; terms: string | null;
  creditedInvoiceNumber?: string | null; reason?: string | null;
}): DocumentSnapshot {
  const body: Omit<DocumentSnapshot, "contentHash"> = {
    version: SNAPSHOT_VERSION,
    kind: input.kind,
    number: input.number,
    locale: input.organization.locale,
    currency: input.currency,
    issueDate: input.issueDate.toISOString(),
    dueDate: input.dueDate ? input.dueDate.toISOString() : null,
    brandColor: input.organization.brandColor,
    logoDataUrl: input.organization.logoDataUrl,
    seller: sellerFromOrganization(input.organization),
    buyer: buyerFromClient(input.client),
    items: input.lines.map((line) => ({
      description: line.description, quantity: String(line.quantity), unitPrice: String(line.unitPrice),
      discountPercent: String(line.discountPercent), taxRate: String(line.taxRate),
      taxName: line.taxName ?? null, lineTotal: String(line.lineTotal),
    })),
    subtotal: String(input.subtotal), discountTotal: String(input.discountTotal), taxTotal: String(input.taxTotal),
    withholdingRate: String(input.withholdingRate), withholdingTotal: String(input.withholdingTotal), total: String(input.total),
    notes: input.notes, terms: input.terms,
    creditedInvoiceNumber: input.creditedInvoiceNumber ?? null,
    reason: input.reason ?? null,
  };
  return { ...body, contentHash: hashSnapshotContent(body) };
}

/** Narrow an untrusted JSON column to a snapshot, or null when it is missing/unknown. */
export function parseSnapshot(value: unknown): DocumentSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Partial<DocumentSnapshot>;
  if (s.version !== SNAPSHOT_VERSION || typeof s.number !== "string" || !Array.isArray(s.items) || typeof s.contentHash !== "string") return null;
  return s as DocumentSnapshot;
}

export function verifySnapshot(snapshot: DocumentSnapshot): boolean {
  const { contentHash, ...body } = snapshot;
  return hashSnapshotContent(body) === contentHash;
}

/** Build the PDF input from a frozen snapshot; only payment state is live. */
export function snapshotToPdfDocument(
  snapshot: DocumentSnapshot,
  live: { status: string; amountPaid: string; balanceDue: string },
): PdfDocument {
  return {
    kind: snapshot.kind, number: snapshot.number, status: live.status, locale: snapshot.locale, currency: snapshot.currency,
    issueDate: new Date(snapshot.issueDate), dueDate: snapshot.dueDate ? new Date(snapshot.dueDate) : null,
    brandColor: snapshot.brandColor, logoDataUrl: snapshot.logoDataUrl,
    seller: snapshot.seller, buyer: snapshot.buyer,
    items: snapshot.items.map((item) => ({
      description: item.description, quantity: item.quantity, unitPrice: item.unitPrice,
      discountPercent: item.discountPercent, taxRate: item.taxRate, lineTotal: item.lineTotal,
    })),
    subtotal: snapshot.subtotal, discountTotal: snapshot.discountTotal, taxTotal: snapshot.taxTotal,
    withholdingTotal: snapshot.withholdingTotal, total: snapshot.total,
    amountPaid: live.amountPaid, balanceDue: live.balanceDue, notes: snapshot.notes, terms: snapshot.terms,
  };
}
