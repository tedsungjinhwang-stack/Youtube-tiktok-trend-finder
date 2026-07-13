-- Todoist 연동
ALTER TABLE "ScheduledVideo" ADD COLUMN IF NOT EXISTS "todoistTaskId" TEXT;

CREATE TABLE IF NOT EXISTS "TodoistConfig" (
  "id"           TEXT NOT NULL DEFAULT 'default',
  "apiToken"     TEXT NOT NULL,
  "projectId"    TEXT,
  "projectName"  TEXT NOT NULL DEFAULT '유튜브 예약 스케줄',
  "accountName"  TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "lastSyncError" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TodoistConfig_pkey" PRIMARY KEY ("id")
);
