-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "id" UUID NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_counters_bucketKey_windowStart_key"
    ON "rate_limit_counters"("bucketKey", "windowStart");

-- CreateIndex
CREATE INDEX "rate_limit_counters_expiresAt_idx"
    ON "rate_limit_counters"("expiresAt");
