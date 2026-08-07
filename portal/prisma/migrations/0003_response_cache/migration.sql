-- CreateTable
CREATE TABLE "response_cache" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB,
    "insufficientEvidence" BOOLEAN NOT NULL DEFAULT false,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "response_cache_cacheKey_key" ON "response_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "response_cache_organizationId_idx" ON "response_cache"("organizationId");

-- CreateIndex
CREATE INDEX "response_cache_expiresAt_idx" ON "response_cache"("expiresAt");

-- AddForeignKey
ALTER TABLE "response_cache" ADD CONSTRAINT "response_cache_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
