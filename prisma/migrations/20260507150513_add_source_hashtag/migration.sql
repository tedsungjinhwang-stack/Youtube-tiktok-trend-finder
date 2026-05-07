-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "sourceHashtag" TEXT;

-- CreateIndex
CREATE INDEX "Video_sourceHashtag_idx" ON "Video"("sourceHashtag");
