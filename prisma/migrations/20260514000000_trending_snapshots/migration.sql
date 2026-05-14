-- Trending mostPopular 스냅샷 누적 + cron 설정

CREATE TABLE IF NOT EXISTS "TrendingSnapshot" (
  "id"              TEXT PRIMARY KEY,
  "region"          TEXT NOT NULL,
  "videoId"         TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "channelId"       TEXT NOT NULL,
  "channelName"     TEXT NOT NULL,
  "thumbnailUrl"    TEXT,
  "viewCount"       BIGINT NOT NULL,
  "likeCount"       BIGINT,
  "commentCount"    BIGINT,
  "durationSeconds" INTEGER NOT NULL,
  "isShorts"        BOOLEAN NOT NULL,
  "publishedAt"     TIMESTAMP(3) NOT NULL,
  "capturedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TrendingSnapshot_region_capturedAt_idx"
  ON "TrendingSnapshot"("region", "capturedAt");
CREATE INDEX IF NOT EXISTS "TrendingSnapshot_region_isShorts_capturedAt_idx"
  ON "TrendingSnapshot"("region", "isShorts", "capturedAt");
CREATE INDEX IF NOT EXISTS "TrendingSnapshot_videoId_idx"
  ON "TrendingSnapshot"("videoId");

CREATE TABLE IF NOT EXISTS "TrendingSettings" (
  "id"            TEXT PRIMARY KEY DEFAULT 'default',
  "enabled"       BOOLEAN NOT NULL DEFAULT TRUE,
  "intervalHours" INTEGER NOT NULL DEFAULT 4,
  "lastRunAt"     TIMESTAMP(3),
  "lastError"     TEXT,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 싱글톤 행 초기 삽입 (이미 있으면 무시)
INSERT INTO "TrendingSettings" ("id", "enabled", "intervalHours")
VALUES ('default', TRUE, 4)
ON CONFLICT ("id") DO NOTHING;
