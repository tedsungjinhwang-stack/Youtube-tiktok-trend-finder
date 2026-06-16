-- 채널별 완성본 첨부 URL (채널당 최대 5개)
CREATE TABLE IF NOT EXISTS "ChannelAttachment" (
  "id"        TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "label"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelAttachment_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "MyChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ChannelAttachment_channelId_idx"
  ON "ChannelAttachment"("channelId");
CREATE INDEX IF NOT EXISTS "ChannelAttachment_createdAt_idx"
  ON "ChannelAttachment"("createdAt");
