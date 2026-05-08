/*
  Warnings:

  - You are about to drop the column `comment` on the `AuditLog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "comment",
ADD COLUMN     "remarks" TEXT;
