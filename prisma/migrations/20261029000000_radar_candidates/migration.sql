-- 신규 발굴 후보 채널
CREATE TABLE "RadarCandidate" (
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "handle" TEXT,
    "thumbnailUrl" TEXT,
    "country" TEXT,
    "channelCreatedAt" TIMESTAMP(3),
    "subscriberCount" INTEGER,
    "viewCount" BIGINT,
    "videoCount" INTEGER,
    "lastUploadAt" TIMESTAMP(3),
    "contentFormat" TEXT,
    "sampleVideos" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL,
    "sourceFolderId" TEXT,
    "suggestions" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'new',
    "folderId" TEXT,
    "checkedAt" TIMESTAMP(3),
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "RadarCandidate_pkey" PRIMARY KEY ("externalId")
);

CREATE INDEX "RadarCandidate_status_foundAt_idx" ON "RadarCandidate"("status", "foundAt");

ALTER TABLE "RadarCandidate" ENABLE ROW LEVEL SECURITY;
