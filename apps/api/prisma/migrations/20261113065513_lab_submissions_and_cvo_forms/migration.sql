-- AlterTable
ALTER TABLE `Animal` ADD COLUMN `colcDate` DATE NULL,
    ADD COLUMN `colcFileKeys` JSON NULL,
    ADD COLUMN `colcNo` VARCHAR(60) NULL,
    ADD COLUMN `purpose` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `DiseaseCase` ADD COLUMN `clinicalSigns` JSON NULL;

-- AlterTable
ALTER TABLE `LabRecord` ADD COLUMN `animalAge` VARCHAR(20) NULL,
    ADD COLUMN `animalSex` VARCHAR(1) NULL,
    ADD COLUMN `condition` VARCHAR(10) NULL,
    ADD COLUMN `farmId` INTEGER NULL,
    ADD COLUMN `hoursSinceDeath` INTEGER NULL,
    ADD COLUMN `organs` VARCHAR(120) NULL,
    ADD COLUMN `receivedVia` VARCHAR(20) NULL,
    ADD COLUMN `species` VARCHAR(40) NULL,
    ADD COLUMN `submissionId` INTEGER NULL,
    MODIFY `caseId` INTEGER NULL;

-- AlterTable
ALTER TABLE `PcicPolicy` ADD COLUMN `applicationDate` DATE NULL,
    ADD COLUMN `applicationType` VARCHAR(10) NULL,
    ADD COLUMN `fileKeys` JSON NULL,
    ADD COLUMN `rsbsaRef` VARCHAR(60) NULL,
    ADD COLUMN `subsidized` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `policyNo` VARCHAR(60) NULL,
    MODIFY `heads` INTEGER NULL,
    MODIFY `startDate` DATE NULL,
    MODIFY `endDate` DATE NULL;

-- AlterTable
ALTER TABLE `PopulationGroup` ADD COLUMN `purpose` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `Vaccination` ADD COLUMN `result` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `LabSubmission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `purpose` VARCHAR(30) NOT NULL,
    `examination` VARCHAR(120) NOT NULL,
    `laboratory` VARCHAR(120) NOT NULL,
    `submittedAt` DATE NULL,
    `submittedBy` VARCHAR(120) NULL,
    `notedBy` VARCHAR(120) NULL,
    `requestId` VARCHAR(60) NULL,
    `accessionNo` VARCHAR(60) NULL,
    `remarks` TEXT NULL,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LabSubmission_code_key`(`code`),
    INDEX `LabSubmission_submittedAt_idx`(`submittedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `LabRecord_submissionId_idx` ON `LabRecord`(`submissionId`);

-- CreateIndex
CREATE INDEX `LabRecord_farmId_idx` ON `LabRecord`(`farmId`);

-- AddForeignKey
ALTER TABLE `LabRecord` ADD CONSTRAINT `LabRecord_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `LabSubmission`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LabRecord` ADD CONSTRAINT `LabRecord_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing case samples: the farm and species come from the case.
UPDATE `LabRecord` l JOIN `DiseaseCase` c ON l.`caseId` = c.`id` SET l.`farmId` = c.`farmId`, l.`species` = c.`species` WHERE l.`farmId` IS NULL;

-- Existing insurance records: the policy start date stands in for the application date.
UPDATE `PcicPolicy` SET `applicationDate` = `startDate` WHERE `applicationDate` IS NULL;
