-- 에셋 채널 스크래핑 필터 (싱글톤). 최근 N일 + 조회수 ≥ M 통과한 영상만 DB 저장.
CREATE TABLE IF NOT EXISTS "ScrapeSettings" (
  "id"          TEXT NOT NULL DEFAULT 'default',
  "recencyDays" INTEGER NOT NULL DEFAULT 10,
  "minViews"    INTEGER NOT NULL DEFAULT 50000,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScrapeSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ScrapeSettings" ("id", "recencyDays", "minViews", "updatedAt")
VALUES ('default', 10, 50000, NOW())
ON CONFLICT ("id") DO NOTHING;
