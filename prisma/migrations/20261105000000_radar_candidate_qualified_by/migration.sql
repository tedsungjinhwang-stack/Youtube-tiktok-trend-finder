-- 신규 발굴 후보가 어느 기준으로 넘었나 (대박 신생 | 최근 잘 나옴)
ALTER TABLE "RadarCandidate" ADD COLUMN IF NOT EXISTS "qualifiedBy" TEXT;
UPDATE "RadarCandidate" SET "qualifiedBy" = '대박 신생' WHERE qualified AND "qualifiedBy" IS NULL;
