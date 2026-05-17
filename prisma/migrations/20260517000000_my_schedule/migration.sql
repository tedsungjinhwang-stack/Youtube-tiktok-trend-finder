-- 내 채널 스케줄 + Google Calendar 동기화

CREATE TABLE "MyChannel" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "category"  TEXT,
  "url"       TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ScheduledVideo" (
  "id"           TEXT PRIMARY KEY,
  "channelId"    TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "notes"        TEXT,
  "scheduledAt"  TIMESTAMP(3) NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'planned',
  "gcalEventId"  TEXT,
  "gcalSyncedAt" TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledVideo_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "MyChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScheduledVideo_channelId_idx"   ON "ScheduledVideo"("channelId");
CREATE INDEX "ScheduledVideo_scheduledAt_idx" ON "ScheduledVideo"("scheduledAt");

CREATE TABLE "GoogleOAuth" (
  "id"           TEXT PRIMARY KEY DEFAULT 'default',
  "accessToken"  TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "accountEmail" TEXT,
  "calendarId"   TEXT NOT NULL DEFAULT 'primary',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);
