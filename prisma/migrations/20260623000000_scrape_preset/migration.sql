-- 카테고리/플랫폼별 자동 스크래핑 프리셋
CREATE TABLE IF NOT EXISTS "ScrapePreset" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "folderId"    TEXT,
  "platform"    TEXT NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT 'ALL',
  "recencyDays" INTEGER,
  "minAgeDays"  INTEGER,
  "minViews"    INTEGER NOT NULL DEFAULT 0,
  "videoType"   TEXT NOT NULL DEFAULT 'ALL',
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt"   TIMESTAMP(3),
  "lastMatched" INTEGER,
  "lastError"   TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrapePreset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScrapePreset_enabled_idx" ON "ScrapePreset"("enabled");
