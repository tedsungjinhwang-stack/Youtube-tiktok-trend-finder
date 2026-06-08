-- 채널별 소재(영상 URL) 목록. 체크하면 (=사용 완료) 행을 삭제해서 목록에서 사라지게 함.
CREATE TABLE IF NOT EXISTS "ChannelMaterial" (
  "id"        TEXT PRIMARY KEY,
  "channelId" TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelMaterial_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "MyChannel"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ChannelMaterial_channelId_idx" ON "ChannelMaterial"("channelId");
CREATE INDEX IF NOT EXISTS "ChannelMaterial_createdAt_idx" ON "ChannelMaterial"("createdAt");
