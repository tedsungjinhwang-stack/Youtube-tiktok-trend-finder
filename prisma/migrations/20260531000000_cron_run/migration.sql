-- 크론 실행 로그
CREATE TABLE IF NOT EXISTS "CronRun" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"  TIMESTAMP(3),
  "status"      TEXT NOT NULL,
  "ytChannels"  INTEGER,
  "ytSynced"    INTEGER,
  "calChannels" INTEGER,
  "calSynced"   INTEGER,
  "error"       TEXT,
  "meta"        TEXT,
  CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CronRun_name_startedAt_idx" ON "CronRun"("name", "startedAt");
