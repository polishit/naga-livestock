-- AlterTable
ALTER TABLE `DiseaseCase` ADD COLUMN `closedAt` DATETIME(3) NULL,
    ADD COLUMN `closedBy` VARCHAR(120) NULL,
    ADD COLUMN `closureNote` TEXT NULL,
    ADD COLUMN `relatedCaseId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `DiseaseCase` ADD CONSTRAINT `DiseaseCase_relatedCaseId_fkey` FOREIGN KEY (`relatedCaseId`) REFERENCES `DiseaseCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
