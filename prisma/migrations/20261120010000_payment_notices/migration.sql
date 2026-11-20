-- Portal do cliente: instruções de pagamento da empresa e avisos de pagamento do cliente.
ALTER TABLE "Organization" ADD COLUMN "paymentInstructions" TEXT;

CREATE TABLE "PaymentNotice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paidOn" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentNotice_organizationId_status_idx" ON "PaymentNotice"("organizationId", "status");
CREATE INDEX "PaymentNotice_invoiceId_idx" ON "PaymentNotice"("invoiceId");

ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
