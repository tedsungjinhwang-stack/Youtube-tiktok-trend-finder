-- 꿀통레이더 작품 인식: TMDB 작품·별칭·출연자, 영상↔작품 연결
CREATE TABLE IF NOT EXISTS "RadarWork" (
  "id" TEXT NOT NULL,
  "tmdbId" INTEGER NOT NULL,
  "mediaType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "originalTitle" TEXT,
  "year" TEXT,
  "category" TEXT NOT NULL,
  "posterPath" TEXT,
  "genres" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "originCountry" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "originalLanguage" TEXT,
  "networks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "onAir" BOOLEAN NOT NULL DEFAULT false,
  "firstAirDate" TIMESTAMP(3),
  "lastAirDate" TIMESTAMP(3),
  "nextEpisodeAt" TIMESTAMP(3),
  "lastEpisodeAt" TIMESTAMP(3),
  "popularity" DOUBLE PRECISION,
  "cast" JSONB NOT NULL DEFAULT '[]',
  "detailAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarWork_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RadarWork_category_idx" ON "RadarWork"("category");
ALTER TABLE "RadarWork" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "RadarAlias" (
  "alias" TEXT NOT NULL,
  "workId" TEXT,
  "personId" INTEGER,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarAlias_pkey" PRIMARY KEY ("alias")
);
ALTER TABLE "RadarAlias" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "RadarPerson" (
  "id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "profilePath" TEXT,
  "credits" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RadarPerson_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "RadarPerson" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "RadarVideo"
  ADD COLUMN IF NOT EXISTS "workId" TEXT,
  ADD COLUMN IF NOT EXISTS "matchedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "matchedAt" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "RadarVideo" ADD CONSTRAINT "RadarVideo_workId_fkey" FOREIGN KEY ("workId") REFERENCES "RadarWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "RadarVideo_workId_publishedAt_idx" ON "RadarVideo"("workId", "publishedAt");

ALTER TABLE "PastHit"
  ADD COLUMN IF NOT EXISTS "workId" TEXT,
  ADD COLUMN IF NOT EXISTS "matchedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "PastHit_workId_idx" ON "PastHit"("workId");
