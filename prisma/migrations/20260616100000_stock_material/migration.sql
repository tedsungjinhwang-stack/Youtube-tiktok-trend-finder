-- 소재 창고 — 폴더별 영구 보관 URL/제목/설명
CREATE TABLE IF NOT EXISTS "StockMaterial" (
  "id"          TEXT NOT NULL,
  "folderId"    TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "title"       TEXT,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockMaterial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockMaterial_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "Folder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StockMaterial_folderId_createdAt_idx"
  ON "StockMaterial"("folderId", "createdAt");
