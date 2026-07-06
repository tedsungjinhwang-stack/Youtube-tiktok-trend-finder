-- 픽시에디터(인스타 템플릿) 저장
CREATE TABLE IF NOT EXISTS "PixiTemplate" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "style"     JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PixiTemplate_pkey" PRIMARY KEY ("id")
);
