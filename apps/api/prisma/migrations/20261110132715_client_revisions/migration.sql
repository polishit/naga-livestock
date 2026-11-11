-- AlterTable
ALTER TABLE `Farm` ADD COLUMN `source` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `Owner` ADD COLUMN `source` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `PopulationGroup` ADD COLUMN `breakdown` JSON NULL;

-- AlterTable
ALTER TABLE `Vaccination` ADD COLUMN `serviceType` VARCHAR(20) NOT NULL DEFAULT 'VACCINATION',
    MODIFY `vaccine` VARCHAR(120) NULL;

-- CreateTable
CREATE TABLE `FarmVisit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `farmId` INTEGER NOT NULL,
    `caseId` INTEGER NULL,
    `date` DATE NOT NULL,
    `purpose` VARCHAR(20) NOT NULL,
    `findings` VARCHAR(20) NOT NULL DEFAULT 'NO_SIGNS',
    `visitedBy` VARCHAR(120) NULL,
    `remarks` TEXT NULL,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FarmVisit_code_key`(`code`),
    INDEX `FarmVisit_farmId_idx`(`farmId`),
    INDEX `FarmVisit_caseId_idx`(`caseId`),
    INDEX `FarmVisit_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Vaccination_serviceType_idx` ON `Vaccination`(`serviceType`);

-- AddForeignKey
ALTER TABLE `FarmVisit` ADD CONSTRAINT `FarmVisit_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FarmVisit` ADD CONSTRAINT `FarmVisit_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `DiseaseCase`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Farm type now means the farm's scale; what it raises is worked out from its population.
UPDATE `Farm` SET `type` = 'backyard' WHERE `type` NOT IN ('backyard', 'commercial');
