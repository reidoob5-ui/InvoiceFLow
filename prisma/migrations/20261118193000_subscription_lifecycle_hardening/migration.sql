ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TABLE "Subscription" ADD COLUMN "providerEventAt" TIMESTAMP(3);
