-- 채널별 YouTube OAuth + 예약영상의 YouTube videoId 추적

ALTER TABLE "ScheduledVideo" ADD COLUMN "youtubeVideoId" TEXT;
CREATE UNIQUE INDEX "ScheduledVideo_channelId_youtubeVideoId_key"
  ON "ScheduledVideo"("channelId", "youtubeVideoId");

CREATE TABLE "ChannelYouTubeOAuth" (
  "id"                 TEXT PRIMARY KEY,
  "myChannelId"        TEXT NOT NULL UNIQUE,
  "accessToken"        TEXT NOT NULL,
  "refreshToken"       TEXT NOT NULL,
  "expiresAt"          TIMESTAMP(3) NOT NULL,
  "youtubeChannelId"   TEXT,
  "youtubeChannelName" TEXT,
  "accountEmail"       TEXT,
  "lastSyncedAt"       TIMESTAMP(3),
  "lastSyncError"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelYouTubeOAuth_myChannelId_fkey"
    FOREIGN KEY ("myChannelId") REFERENCES "MyChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
