/** Format a document number such as INV-2026-0042. The sequence itself is allocated atomically in the database. */
export function formatDocumentNumber(prefix: string, year: number, seq: number, pad = 4): string {
  const safePrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "INV";
  return `${safePrefix}-${year}-${String(seq).padStart(pad, "0")}`;
}

/** Sequence key: one counter per organization, document kind and year (numbering restarts each year). */
export function sequenceKey(kind: "invoice" | "quote" | "credit_note" | "receipt" | "bill", year: number): string {
  return `${kind}:${year}`;
}
