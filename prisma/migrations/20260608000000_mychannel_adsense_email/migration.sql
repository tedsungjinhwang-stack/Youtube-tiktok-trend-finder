-- MyChannel: 애드센스 계정 / 이메일 컬럼 추가 + 애드센스 인덱스
ALTER TABLE "MyChannel" ADD COLUMN IF NOT EXISTS "adsense" TEXT;
ALTER TABLE "MyChannel" ADD COLUMN IF NOT EXISTS "email"   TEXT;
CREATE INDEX IF NOT EXISTS "MyChannel_adsense_idx" ON "MyChannel"("adsense");
