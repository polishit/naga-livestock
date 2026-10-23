-- AlterTable
ALTER TABLE `DiseaseCase` ADD COLUMN `closureOutcome` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `Investigation` ADD COLUMN `actionsTaken` TEXT NULL,
    ADD COLUMN `animalsExamined` INTEGER NULL,
    ADD COLUMN `biosecurity` TEXT NULL,
    ADD COLUMN `clinicalSigns` TEXT NULL,
    ADD COLUMN `deadCount` INTEGER NULL,
    ADD COLUMN `nextVisit` DATE NULL,
    ADD COLUMN `samplesCollected` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sickCount` INTEGER NULL,
    ADD COLUMN `visitType` VARCHAR(30) NOT NULL DEFAULT 'INITIAL';

-- AlterTable
ALTER TABLE `LabRecord` ADD COLUMN `labReference` VARCHAR(60) NULL,
    ADD COLUMN `sampleCount` INTEGER NULL,
    ADD COLUMN `submittedBy` VARCHAR(120) NULL,
    ADD COLUMN `testMethod` VARCHAR(80) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NULL,
    ADD COLUMN `updatedBy` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `ResponseActivity` ADD COLUMN `disposalMethod` VARCHAR(80) NULL,
    ADD COLUMN `endDate` DATE NULL,
    ADD COLUMN `location` VARCHAR(200) NULL,
    ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'COMPLETED';
