-- AlterTable
ALTER TABLE `Owner` ADD COLUMN `email` VARCHAR(120) NULL,
    ADD COLUMN `returnReason` VARCHAR(300) NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedBy` VARCHAR(120) NULL,
    ADD COLUMN `selfRegistered` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED', 'PENDING') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `User` ADD COLUMN `notifPrefs` JSON NULL,
    ADD COLUMN `phone` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `FarmRegistration` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `barangay` VARCHAR(60) NOT NULL,
    `zone` VARCHAR(60) NULL,
    `address` VARCHAR(250) NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `gpsAccuracy` DOUBLE NULL,
    `livestock` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `returnReason` VARCHAR(300) NULL,
    `reviewedBy` VARCHAR(120) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `farmId` INTEGER NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FarmRegistration_code_key`(`code`),
    INDEX `FarmRegistration_status_idx`(`status`),
    INDEX `FarmRegistration_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PopulationRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `farmId` INTEGER NOT NULL,
    `groupId` INTEGER NULL,
    `species` VARCHAR(40) NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `before` INTEGER NOT NULL,
    `after` INTEGER NOT NULL,
    `note` VARCHAR(300) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `flagged` BOOLEAN NOT NULL DEFAULT false,
    `flagReason` VARCHAR(200) NULL,
    `decidedBy` VARCHAR(120) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` VARCHAR(300) NULL,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PopulationRequest_status_idx`(`status`),
    INDEX `PopulationRequest_farmId_idx`(`farmId`),
    INDEX `PopulationRequest_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiseaseReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `farmId` INTEGER NOT NULL,
    `species` VARCHAR(40) NOT NULL,
    `symptoms` TEXT NOT NULL,
    `signs` JSON NULL,
    `affected` INTEGER NOT NULL,
    `deaths` INTEGER NOT NULL DEFAULT 0,
    `observedAt` DATE NOT NULL,
    `photoKeys` JSON NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `gpsAccuracy` DOUBLE NULL,
    `locationSource` VARCHAR(20) NOT NULL,
    `distanceFromFarm` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'REPORTED',
    `rejectReason` VARCHAR(300) NULL,
    `caseId` INTEGER NULL,
    `reviewedBy` VARCHAR(120) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DiseaseReport_code_key`(`code`),
    INDEX `DiseaseReport_status_idx`(`status`),
    INDEX `DiseaseReport_ownerId_idx`(`ownerId`),
    INDEX `DiseaseReport_farmId_idx`(`farmId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reportId` INTEGER NOT NULL,
    `fromOwner` BOOLEAN NOT NULL,
    `byName` VARCHAR(120) NOT NULL,
    `text` TEXT NOT NULL,
    `photoKeys` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReportMessage_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(120) NULL,
    `refKey` VARCHAR(80) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    UNIQUE INDEX `Notification_userId_refKey_key`(`userId`, `refKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonitoringZone` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `caseId` INTEGER NULL,
    `disease` VARCHAR(150) NOT NULL,
    `barangay` VARCHAR(60) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `radiusM` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    `guidance` TEXT NULL,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `liftedBy` VARCHAR(120) NULL,
    `liftedAt` DATETIME(3) NULL,
    `liftReason` VARCHAR(300) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MonitoringZone_code_key`(`code`),
    INDEX `MonitoringZone_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VaccinationActivity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `vaccine` VARCHAR(120) NULL,
    `species` VARCHAR(40) NOT NULL,
    `barangay` VARCHAR(60) NOT NULL,
    `date` DATE NOT NULL,
    `time` VARCHAR(40) NULL,
    `venue` VARCHAR(200) NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    `cancelReason` VARCHAR(300) NULL,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VaccinationActivity_code_key`(`code`),
    INDEX `VaccinationActivity_date_idx`(`date`),
    INDEX `VaccinationActivity_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivitySignup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `activityId` INTEGER NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `farmId` INTEGER NOT NULL,
    `species` VARCHAR(40) NOT NULL,
    `heads` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'SIGNED_UP',
    `vaccinationId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ActivitySignup_ownerId_idx`(`ownerId`),
    UNIQUE INDEX `ActivitySignup_activityId_farmId_species_key`(`activityId`, `farmId`, `species`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OwnerVaccination` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `farmId` INTEGER NOT NULL,
    `species` VARCHAR(40) NOT NULL,
    `vaccine` VARCHAR(120) NOT NULL,
    `date` DATE NOT NULL,
    `heads` INTEGER NOT NULL,
    `givenBy` VARCHAR(120) NOT NULL,
    `proofKeys` JSON NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
    `reason` VARCHAR(300) NULL,
    `vaccinationId` INTEGER NULL,
    `decidedBy` VARCHAR(120) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OwnerVaccination_status_idx`(`status`),
    INDEX `OwnerVaccination_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `farmId` INTEGER NOT NULL,
    `serviceType` VARCHAR(20) NOT NULL,
    `species` VARCHAR(40) NULL,
    `note` VARCHAR(500) NULL,
    `preferredDate` DATE NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    `scheduledDate` DATE NULL,
    `response` VARCHAR(300) NULL,
    `handledBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServiceRequest_code_key`(`code`),
    INDEX `ServiceRequest_status_idx`(`status`),
    INDEX `ServiceRequest_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` TEXT NOT NULL,
    `audience` VARCHAR(20) NOT NULL,
    `barangay` VARCHAR(60) NULL,
    `zoneId` INTEGER NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `publishedBy` VARCHAR(120) NULL,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `withdrawnBy` VARCHAR(120) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `withdrawReason` VARCHAR(300) NULL,

    UNIQUE INDEX `Announcement_code_key`(`code`),
    INDEX `Announcement_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_phone_key` ON `User`(`phone`);

-- AddForeignKey
ALTER TABLE `FarmRegistration` ADD CONSTRAINT `FarmRegistration_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiseaseReport` ADD CONSTRAINT `DiseaseReport_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportMessage` ADD CONSTRAINT `ReportMessage_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `DiseaseReport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivitySignup` ADD CONSTRAINT `ActivitySignup_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `VaccinationActivity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

