-- 작품 인식 대상(아직 인식 안 된 영상)만 담는 부분 인덱스 — 작품 인식 쿼리가 매번 영상 전체를 훑던 것을 막는다
CREATE INDEX IF NOT EXISTS "RadarVideo_unmatched_idx" ON "RadarVideo" ("channelId") WHERE "matchedAt" IS NULL AND NOT "matchLocked";
