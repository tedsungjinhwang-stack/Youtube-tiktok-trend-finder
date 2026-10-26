-- 꿀통레이더: 관심 목록(폴더), 채널 순위용 통계, 터진 영상 추적
ALTER TABLE "Folder"
  ADD COLUMN IF NOT EXISTS "watched" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "Channel"
  ADD COLUMN IF NOT EXISTS "contentFormat" TEXT,
  ADD COLUMN IF NOT EXISTS "lastUploadAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "channelCreatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "videoCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "dailyViews" INTEGER,
  ADD COLUMN IF NOT EXISTS "dailyViewsPrev" INTEGER,
  ADD COLUMN IF NOT EXISTS "weekViews" BIGINT,
  ADD COLUMN IF NOT EXISTS "monthViews" BIGINT,
  ADD COLUMN IF NOT EXISTS "viewHistory" BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  ADD COLUMN IF NOT EXISTS "videoCountHistory" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN IF NOT EXISTS "historyDate" DATE,
  ADD COLUMN IF NOT EXISTS "statsCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "uploadsCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "uploadsSeenCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "baselineMedian" INTEGER,
  ADD COLUMN IF NOT EXISTS "weeklyUploads" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Channel_isActive_dailyViews_idx" ON "Channel"("isActive", "dailyViews");

CREATE TABLE IF NOT EXISTS "RadarVideo" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "durationSec" INTEGER,
  "isShorts" BOOLEAN,
  "views" INTEGER NOT NULL DEFAULT 0,
  "likes" INTEGER,
  "comments" INTEGER,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "trackT" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "trackV" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "gain1h" INTEGER,
  "gain3h" INTEGER,
  "gain6h" INTEGER,
  "gain12h" INTEGER,
  "gain24h" INTEGER,
  "checkedAt" TIMESTAMP(3),
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarVideo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RadarVideo_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RadarVideo_publishedAt_idx" ON "RadarVideo"("publishedAt");
CREATE INDEX IF NOT EXISTS "RadarVideo_channelId_publishedAt_idx" ON "RadarVideo"("channelId", "publishedAt");
ALTER TABLE "RadarVideo" ENABLE ROW LEVEL SECURITY;

-- 과거 트래픽: 업로드가 끊긴 채널의 100만+ 영상, 보관한 채널 목록
CREATE TABLE IF NOT EXISTS "PastHit" (
  "id" TEXT NOT NULL,
  "channelExternalId" TEXT NOT NULL,
  "channelName" TEXT,
  "channelThumb" TEXT,
  "folder" TEXT,
  "title" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "durationSec" INTEGER,
  "isShorts" BOOLEAN NOT NULL,
  "views" INTEGER NOT NULL,
  "likes" INTEGER,
  "comments" INTEGER,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PastHit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PastHit_views_idx" ON "PastHit"("views");
CREATE INDEX IF NOT EXISTS "PastHit_folder_idx" ON "PastHit"("folder");
CREATE INDEX IF NOT EXISTS "PastHit_channelExternalId_idx" ON "PastHit"("channelExternalId");
ALTER TABLE "PastHit" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ArchivedChannel" (
  "externalId" TEXT NOT NULL,
  "name" TEXT,
  "thumbnailUrl" TEXT,
  "folder" TEXT,
  "subscriberCount" INTEGER,
  "totalViewCount" BIGINT,
  "lastUploadAt" TIMESTAMP(3),
  "hits" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArchivedChannel_pkey" PRIMARY KEY ("externalId")
);
ALTER TABLE "ArchivedChannel" ENABLE ROW LEVEL SECURITY;
