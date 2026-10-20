/*
  Warnings:

  - You are about to drop the column `photoKey` on the `Animal` table. All the data in the column will be lost.
  - You are about to drop the column `photoKey` on the `DiseaseCase` table. All the data in the column will be lost.
  - You are about to drop the column `photoKey` on the `StrayIncident` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Animal` DROP COLUMN `photoKey`,
    ADD COLUMN `photoKeys` JSON NULL;

-- AlterTable
ALTER TABLE `DiseaseCase` DROP COLUMN `photoKey`,
    ADD COLUMN `photoKeys` JSON NULL;

-- AlterTable
ALTER TABLE `StrayIncident` DROP COLUMN `photoKey`,
    ADD COLUMN `photoKeys` JSON NULL;
