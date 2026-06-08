-- MyChannel: 플랫폼 대분류 (YOUTUBE / INSTAGRAM / THREADS / NAVER_CLIP)
ALTER TABLE "MyChannel" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'YOUTUBE';
CREATE INDEX IF NOT EXISTS "MyChannel_platform_idx" ON "MyChannel"("platform");
