-- 프리셋 마지막 실행 시 스크랩한 채널 수 (진단용)
ALTER TABLE "ScrapePreset" ADD COLUMN IF NOT EXISTS "lastScraped" INTEGER;
