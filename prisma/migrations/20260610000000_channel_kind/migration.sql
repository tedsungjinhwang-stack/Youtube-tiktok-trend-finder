-- Channel.kind: 'REFERENCE' (레퍼런스 채널) | 'SOURCE' (원본 소스 채널)
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'REFERENCE';
CREATE INDEX IF NOT EXISTS "Channel_kind_idx" ON "Channel"("kind");
