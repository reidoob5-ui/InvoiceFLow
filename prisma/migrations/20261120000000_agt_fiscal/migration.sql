-- Facturação electrónica AGT: perfil fiscal, séries, documentos imutáveis, fila de envio e auditoria.

CREATE TYPE "FiscalEnvironment" AS ENUM ('HOMOLOGATION', 'PRODUCTION');
CREATE TYPE "FiscalDeliveryState" AS ENUM ('PENDING', 'RETRY', 'SUBMITTED', 'VALID', 'PENALIZED', 'INVALID', 'BLOCKED');

CREATE TABLE "FiscalProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nif" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "eacCode" TEXT,
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGATION',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "privateKeyEncrypted" TEXT,
    "publicKeyPem" TEXT,
    "keyFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FiscalProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalSeries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "firstNumber" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "lastNumber" INTEGER,
    "lastDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'A',
    "establishment" TEXT NOT NULL DEFAULT 'SEDE',
    "contingency" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "documentNo" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "documentDate" TEXT NOT NULL,
    "systemEntryDate" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "state" "FiscalDeliveryState" NOT NULL DEFAULT 'PENDING',
    "requestId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "errors" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FiscalDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentNo" TEXT,
    "kind" TEXT NOT NULL,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalProfile_organizationId_key" ON "FiscalProfile"("organizationId");
CREATE INDEX "FiscalSeries_organizationId_documentType_year_idx" ON "FiscalSeries"("organizationId", "documentType", "year");
CREATE UNIQUE INDEX "FiscalSeries_organizationId_code_year_documentType_key" ON "FiscalSeries"("organizationId", "code", "year", "documentType");
CREATE UNIQUE INDEX "FiscalDocument_invoiceId_key" ON "FiscalDocument"("invoiceId");
CREATE INDEX "FiscalDocument_organizationId_createdAt_idx" ON "FiscalDocument"("organizationId", "createdAt");
CREATE UNIQUE INDEX "FiscalDocument_organizationId_documentNo_key" ON "FiscalDocument"("organizationId", "documentNo");
CREATE UNIQUE INDEX "FiscalDocument_seriesId_seq_key" ON "FiscalDocument"("seriesId", "seq");
CREATE UNIQUE INDEX "FiscalDelivery_documentId_key" ON "FiscalDelivery"("documentId");
CREATE INDEX "FiscalDelivery_organizationId_state_nextAttemptAt_idx" ON "FiscalDelivery"("organizationId", "state", "nextAttemptAt");
CREATE INDEX "FiscalEvent_organizationId_at_idx" ON "FiscalEvent"("organizationId", "at");

ALTER TABLE "FiscalProfile" ADD CONSTRAINT "FiscalProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalSeries" ADD CONSTRAINT "FiscalSeries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "FiscalSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalDelivery" ADD CONSTRAINT "FiscalDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalDelivery" ADD CONSTRAINT "FiscalDelivery_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FiscalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FiscalEvent" ADD CONSTRAINT "FiscalEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Decreto 312/18 art. 6.º e): sem alteração de informação fiscal sem evidência.
CREATE FUNCTION "agt_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invoiceflow: % on % is not allowed (fiscal records are immutable)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FiscalDocument_immutable" BEFORE UPDATE OR DELETE ON "FiscalDocument"
  FOR EACH ROW EXECUTE FUNCTION "agt_block_mutation"();
CREATE TRIGGER "FiscalEvent_append_only" BEFORE UPDATE OR DELETE ON "FiscalEvent"
  FOR EACH ROW EXECUTE FUNCTION "agt_block_mutation"();
