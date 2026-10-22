-- AlterTable
ALTER TABLE `DiseaseCase` ADD COLUMN `populationReconciled` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Investigation` ADD COLUMN `voidReason` VARCHAR(300) NULL,
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedBy` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `LabRecord` ADD COLUMN `voidReason` VARCHAR(300) NULL,
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedBy` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `PopulationUpdate` ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'VERIFIED';

-- AlterTable
ALTER TABLE `ResponseActivity` ADD COLUMN `heads` INTEGER NULL,
    ADD COLUMN `voidReason` VARCHAR(300) NULL,
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedBy` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `Vaccination` ADD COLUMN `reminderDone` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `voidReason` VARCHAR(300) NULL,
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedBy` VARCHAR(120) NULL;
