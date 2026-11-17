-- AlterTable
ALTER TABLE `Owner` ADD COLUMN `idType` VARCHAR(40) NULL,
    ADD COLUMN `idNumber` VARCHAR(60) NULL,
    ADD COLUMN `idPhotoKeys` JSON NULL,
    ADD COLUMN `submittedAt` DATETIME(3) NULL,
    ADD COLUMN `verifyChecklist` JSON NULL;

-- AlterTable
ALTER TABLE `FarmRegistration` ADD COLUMN `verifyChecklist` JSON NULL;

-- AlterTable
ALTER TABLE `DiseaseReport` ADD COLUMN `assessment` TEXT NULL,
    ADD COLUMN `visitDate` DATE NULL;

-- AlterTable
ALTER TABLE `ServiceRequest` ADD COLUMN `scheduledTime` VARCHAR(40) NULL;
