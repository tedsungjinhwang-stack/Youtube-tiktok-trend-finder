-- 주간/월간/연간 계획 메모
CREATE TABLE IF NOT EXISTS "PlanNote" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanNote_pkey" PRIMARY KEY ("id")
);
