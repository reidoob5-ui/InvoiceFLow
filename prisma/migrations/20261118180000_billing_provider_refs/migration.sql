ALTER TABLE "PlatformInvoice"
  ADD COLUMN "targetPlanId" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerRef" TEXT;

CREATE INDEX "PlatformInvoice_provider_providerRef_idx"
  ON "PlatformInvoice"("provider", "providerRef");

ALTER TABLE "PlatformInvoice"
  ADD CONSTRAINT "PlatformInvoice_targetPlanId_fkey"
  FOREIGN KEY ("targetPlanId") REFERENCES "Plan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProviderWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderWebhookEvent_provider_eventId_key"
  ON "ProviderWebhookEvent"("provider", "eventId");
CREATE INDEX "ProviderWebhookEvent_createdAt_idx"
  ON "ProviderWebhookEvent"("createdAt");