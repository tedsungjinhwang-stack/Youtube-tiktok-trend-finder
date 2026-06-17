-- MyChannel: 핸드폰 컬럼 추가
ALTER TABLE "MyChannel" ADD COLUMN IF NOT EXISTS "phone" TEXT;
