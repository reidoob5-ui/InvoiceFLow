-- AlterTable
ALTER TABLE "PlatformInvoice" ADD COLUMN "reference" TEXT,
ADD COLUMN "method" TEXT,
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "customerNote" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewNote" TEXT;

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvoice_reference_key" ON "PlatformInvoice"("reference");
