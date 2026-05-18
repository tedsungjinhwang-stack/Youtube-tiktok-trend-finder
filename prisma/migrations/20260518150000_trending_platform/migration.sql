-- Add platform column + URL field for TikTok support
ALTER TABLE "TrendingSnapshot" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'YOUTUBE';
ALTER TABLE "TrendingSnapshot" ADD COLUMN "url" TEXT;
CREATE INDEX "TrendingSnapshot_platform_region_capturedAt_idx"
  ON "TrendingSnapshot"("platform", "region", "capturedAt");
