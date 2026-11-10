-- 터진 영상 후보 표시 — 수집기가 「터졌다」 기준을 넘은 채로 잰 시각을 찍고, 화면은 이 부분 인덱스로 후보만 읽는다
-- (예전: 터진 영상을 열 때마다 30일 영상 약 25만 개를 다 읽어 작은 DB 에서 1분 가까이)
-- 운영에는 CREATE INDEX CONCURRENTLY 로 먼저 넣었다
ALTER TABLE "RadarVideo" ADD COLUMN IF NOT EXISTS "hotAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "RadarVideo_hot_idx" ON "RadarVideo" ("hotAt") WHERE "hotAt" IS NOT NULL;
