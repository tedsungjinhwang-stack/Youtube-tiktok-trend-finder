-- 터진 영상 미리 계산 (매시간 수집 직후 다시 채움) — 화면은 이 좁은 표만 읽는다
CREATE TABLE IF NOT EXISTS "RadarHot" (
  "format" TEXT NOT NULL,
  "win" INTEGER NOT NULL,
  "videoId" TEXT NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "gain" INTEGER NOT NULL,
  "gain1h" INTEGER,
  "gain6h" INTEGER,
  "gain12h" INTEGER,
  "views" INTEGER NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "fresh4" BOOLEAN NOT NULL,
  "trackN" INTEGER NOT NULL,
  "trackSpan" INTEGER NOT NULL,
  "channelId" TEXT NOT NULL,
  CONSTRAINT "RadarHot_pkey" PRIMARY KEY ("format", "win", "videoId")
);
CREATE INDEX IF NOT EXISTS "RadarHot_format_win_rate_idx" ON "RadarHot" ("format", "win", "rate");
