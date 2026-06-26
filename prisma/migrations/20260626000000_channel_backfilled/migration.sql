-- 채널별 옛날 영상 백필 완료 시점
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "backfilledAt" TIMESTAMP(3);
