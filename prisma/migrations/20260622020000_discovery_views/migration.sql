-- aagag 메인 피드의 조회수 추적용
ALTER TABLE "DiscoveryPost" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER;
ALTER TABLE "DiscoveryPost" ADD COLUMN IF NOT EXISTS "prevViewCount" INTEGER;
