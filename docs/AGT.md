# AGT e-invoicing (Angola)

Implements the electronic invoicing flow of Decreto Executivo n.º 683/25. **Status: homologation only. The software is not AGT-certified and must not be presented as compliant until AGT validates it.**

## Where things are
- `apps/web/lib/agt/`: engine. `decimal`/`calc` (exact BigInt maths, IVA rounded up to the cêntimo), `codes` (document types, exemption tables), `series`, `signing` (RS256 JWS), `qr` + `qr-encode` (URL and dependency-free QR encoder), `document` (Anexo I builder and validator), `client` (the 7 AGT REST services), `service` (Prisma persistence, issuing, outbox, polling), `invoice-mapper` (InvoiceFlow invoice → FT/NC), `key-crypto` (AES-256-GCM for taxpayer keys).
- API: `/api/fiscal/{profile,key,series,status,sync}` and `POST /api/invoices/[id]/fiscal`. Permission resource: `fiscal`.
- UI: `/fiscal`. The PDF shows the fiscal number and QR for certified invoices.
- Tables: `FiscalProfile`, `FiscalSeries`, `FiscalDocument` (immutable by DB trigger), `FiscalDelivery`, `FiscalEvent` (append-only by DB trigger).
- Cron: `/api/cron/daily` runs the fiscal sync. On Vercel Hobby the cron is daily while AGT's window is 24h, so use the "Enviar / actualizar agora" button or a more frequent scheduler.

## Flow
1. `/fiscal`: save NIF/name, store the taxpayer RSA key (PEM from the AGT portal; test keys can be generated in homologation), activate.
2. Request a series per document type and year (AGT generates the code).
3. Issue an invoice normally, then certify it (`POST /api/invoices/[id]/fiscal`). The signed document is stored and queued with a 24h deadline.
4. Sync submits batches of up to 30, then polls the request status: VALID, PENALIZED, INVALID. A rejected document needs a correction document (`documentStatus = C`).

## Safeguards
- Only AOA invoices. 0% VAT lines need an explicit exemption code (Tabela 4). The fiscal total must equal the invoice total or issuing is refused.
- Receipts (AR/RC/RG) only over documents AGT already validated.
- Series numbering is gap-free and chronological (Serializable transaction plus unique constraint).

## Open points to confirm with AGT
1. Exact signature format: Anexo I says 256 characters, a compact RS256 JWS is longer. Header `typ` (JWT vs JOSE), `signatureVersion`, and whether `documentTotals` is part of the signed payload.
2. QR version: the Anexo asks for version 4 but the official URL needs version 7 (45×45) at correction level M.
3. Debit/credit convention per document type (currently NC and RE use `debitAmount`).
4. Rounding of each line's net amount (currently half-up).
5. Full error table E01–E46 and code lists 6.1–6.6; SAF-T; CAE tables.
6. Producer Basic Auth, producer key registration, and the software validation number.
7. Contingency procedure, and encryption of taxpayer keys with a KMS/HSM for production (today AES-256-GCM with an env key).
8. The default line `operationType` ("SG") is an assumption.

## Before going to production
Rotate `FISCAL_KEY_ENCRYPTION_KEY` before storing real taxpayer keys (the current value was generated during development), run `tests/agt-flow.integration.test.ts` against a test database (`INTEGRATION_DB=1`), and complete AGT's homologation tests.
