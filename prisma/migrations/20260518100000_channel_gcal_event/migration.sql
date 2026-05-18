-- 채널 단위 1개 GCal 이벤트 (마지막 예약일자, 채널명 + 영상개수)

ALTER TABLE "MyChannel" ADD COLUMN "gcalEventId" TEXT;
ALTER TABLE "MyChannel" ADD COLUMN "gcalSyncedAt" TIMESTAMP(3);
