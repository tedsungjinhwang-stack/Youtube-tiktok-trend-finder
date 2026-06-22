-- 디스커버리(픽셀링 클론): 커뮤니티/뉴스/레딧 인기글 수집 테이블
CREATE TABLE IF NOT EXISTS "DiscoveryPost" (
  "id"           TEXT NOT NULL,
  "tab"          TEXT NOT NULL,
  "country"      TEXT NOT NULL,
  "source"       TEXT NOT NULL,
  "sourceLabel"  TEXT,
  "sourceKey"    TEXT NOT NULL,
  "rank"         INTEGER NOT NULL DEFAULT 0,
  "title"        TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "commentCount" INTEGER,
  "score"        INTEGER,
  "lang"         TEXT,
  "publishedAt"  TIMESTAMP(3),
  "collectedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscoveryPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DiscoveryPost_sourceKey_key" ON "DiscoveryPost"("sourceKey");
CREATE INDEX IF NOT EXISTS "DiscoveryPost_tab_country_rank_idx" ON "DiscoveryPost"("tab", "country", "rank");
CREATE INDEX IF NOT EXISTS "DiscoveryPost_tab_collectedAt_idx" ON "DiscoveryPost"("tab", "collectedAt");
CREATE INDEX IF NOT EXISTS "DiscoveryPost_collectedAt_idx" ON "DiscoveryPost"("collectedAt");
