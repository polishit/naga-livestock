-- AlterTable
ALTER TABLE `DiseaseCase` ADD COLUMN `voidReason` VARCHAR(300) NULL,
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedBy` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `StrayIncident` ADD COLUMN `voidReason` VARCHAR(300) NULL,
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedBy` VARCHAR(120) NULL;