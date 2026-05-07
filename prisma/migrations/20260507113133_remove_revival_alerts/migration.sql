/*
  Warnings:

  - You are about to drop the column `missCount` on the `Video` table. All the data in the column will be lost.
  - You are about to drop the `Alert` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VideoSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_videoId_fkey";

-- DropForeignKey
ALTER TABLE "VideoSnapshot" DROP CONSTRAINT "VideoSnapshot_videoId_fkey";

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "missCount";

-- DropTable
DROP TABLE "Alert";

-- DropTable
DROP TABLE "VideoSnapshot";

-- DropEnum
DROP TYPE "AlertKind";
