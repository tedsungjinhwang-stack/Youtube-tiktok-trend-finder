-- 한국어 채널 판별 (제목 한글 비율, 하루 한 번) — 기회판·터진 영상이 같이 쓴다
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "koRatio" DOUBLE PRECISION;
-- 터진 영상 미리 계산: 제목에 한글이 있나 (판별 전 새 채널용)
ALTER TABLE "RadarHot" ADD COLUMN IF NOT EXISTS "koTitle" BOOLEAN NOT NULL DEFAULT false;
