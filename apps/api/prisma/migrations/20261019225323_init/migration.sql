-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `title` VARCHAR(120) NULL,
    `role` ENUM('ADMIN', 'STAFF', 'READONLY') NOT NULL DEFAULT 'STAFF',
    `passwordHash` VARCHAR(100) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `tokenHash` VARCHAR(128) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Owner` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `fullName` VARCHAR(150) NOT NULL,
    `barangay` VARCHAR(60) NOT NULL,
    `zone` VARCHAR(60) NULL,
    `street` VARCHAR(200) NULL,
    `contact` VARCHAR(40) NULL,
    `rsbsa` VARCHAR(60) NULL,
    `remarks` TEXT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `registeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Owner_code_key`(`code`),
    INDEX `Owner_barangay_idx`(`barangay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PcicPolicy` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `policyNo` VARCHAR(60) NOT NULL,
    `species` VARCHAR(40) NOT NULL,
    `heads` INTEGER NOT NULL,
    `amountCovered` DECIMAL(12, 2) NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    `remarks` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Farm` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `barangay` VARCHAR(60) NOT NULL,
    `zone` VARCHAR(60) NULL,
    `address` VARCHAR(250) NULL,
    `pastureArea` DOUBLE NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `remarks` TEXT NULL,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Farm_code_key`(`code`),
    INDEX `Farm_barangay_idx`(`barangay`),
    INDEX `Farm_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PopulationGroup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `farmId` INTEGER NOT NULL,
    `species` VARCHAR(40) NOT NULL,
    `breed` VARCHAR(80) NULL,
    `sex` VARCHAR(20) NOT NULL DEFAULT 'Mixed',
    `lifeStage` VARCHAR(30) NOT NULL DEFAULT 'Mixed',
    `count` INTEGER NOT NULL DEFAULT 0,
    `healthStatus` VARCHAR(40) NOT NULL DEFAULT 'Healthy',
    `remarks` VARCHAR(500) NULL,
    `lastVerified` VARCHAR(7) NULL,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PopulationGroup_code_key`(`code`),
    INDEX `PopulationGroup_farmId_idx`(`farmId`),
    INDEX `PopulationGroup_species_idx`(`species`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PopulationUpdate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `groupId` INTEGER NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `count` INTEGER NOT NULL,
    `previous` INTEGER NULL,
    `change` INTEGER NOT NULL DEFAULT 0,
    `reason` VARCHAR(200) NULL,
    `superseded` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PopulationUpdate_groupId_month_idx`(`groupId`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Animal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `earTag` VARCHAR(40) NULL,
    `groupId` INTEGER NOT NULL,
    `species` VARCHAR(40) NOT NULL,
    `breed` VARCHAR(80) NULL,
    `sex` VARCHAR(10) NOT NULL,
    `dob` DATE NULL,
    `estimatedAge` VARCHAR(40) NULL,
    `lifeStage` VARCHAR(40) NULL,
    `markings` VARCHAR(200) NULL,
    `cowlick` VARCHAR(200) NULL,
    `health` VARCHAR(80) NULL,
    `photoKey` VARCHAR(300) NULL,
    `remarks` VARCHAR(500) NULL,
    `status` ENUM('ACTIVE', 'SOLD', 'DECEASED', 'MISSING', 'SLAUGHTERED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Animal_code_key`(`code`),
    UNIQUE INDEX `Animal_earTag_key`(`earTag`),
    INDEX `Animal_groupId_idx`(`groupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OwnershipTransfer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `animalId` INTEGER NOT NULL,
    `fromOwnerId` INTEGER NOT NULL,
    `fromFarmId` INTEGER NOT NULL,
    `toOwnerId` INTEGER NOT NULL,
    `toFarmId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `type` ENUM('TRANSFER', 'REVERSAL') NOT NULL DEFAULT 'TRANSFER',
    `remarks` VARCHAR(300) NULL,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OwnershipTransfer_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StrayIncident` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `discoveredAt` DATETIME(3) NOT NULL,
    `species` VARCHAR(40) NOT NULL,
    `earTag` VARCHAR(40) NULL,
    `animalId` INTEGER NULL,
    `ownerId` INTEGER NULL,
    `barangay` VARCHAR(60) NOT NULL,
    `location` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `photoKey` VARCHAR(300) NULL,
    `status` ENUM('REPORTED', 'IMPOUNDED', 'RELEASED', 'CLOSED') NOT NULL DEFAULT 'REPORTED',
    `violations` INTEGER NOT NULL DEFAULT 0,
    `remarks` TEXT NULL,
    `createdBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StrayIncident_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiseaseCase` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `farmId` INTEGER NOT NULL,
    `barangay` VARCHAR(60) NOT NULL,
    `zone` VARCHAR(60) NULL,
    `species` VARCHAR(40) NOT NULL,
    `disease` VARCHAR(150) NOT NULL,
    `affected` INTEGER NOT NULL,
    `deaths` INTEGER NOT NULL DEFAULT 0,
    `symptomsDate` DATE NULL,
    `reportedAt` DATE NOT NULL,
    `symptoms` TEXT NULL,
    `reportedBy` VARCHAR(120) NULL,
    `assignedToId` INTEGER NULL,
    `sampleInfo` VARCHAR(300) NULL,
    `remarks` TEXT NULL,
    `lat` DOUBLE NULL,
    `lng` DOUBLE NULL,
    `locationSource` VARCHAR(40) NULL,
    `photoKey` VARCHAR(300) NULL,
    `status` ENUM('SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'AWAITING_RESULT', 'POSITIVE', 'NEGATIVE') NOT NULL DEFAULT 'SUSPECTED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DiseaseCase_code_key`(`code`),
    INDEX `DiseaseCase_status_idx`(`status`),
    INDEX `DiseaseCase_barangay_idx`(`barangay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseStatusHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caseId` INTEGER NOT NULL,
    `status` ENUM('SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'AWAITING_RESULT', 'POSITIVE', 'NEGATIVE') NOT NULL,
    `note` VARCHAR(500) NULL,
    `byName` VARCHAR(120) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CaseStatusHistory_caseId_idx`(`caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Investigation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caseId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `investigator` VARCHAR(120) NULL,
    `notes` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LabRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caseId` INTEGER NOT NULL,
    `sampleId` VARCHAR(60) NOT NULL,
    `sampleType` VARCHAR(80) NULL,
    `collectedAt` DATE NULL,
    `laboratory` VARCHAR(120) NULL,
    `sentAt` DATE NULL,
    `result` ENUM('PENDING', 'POSITIVE', 'NEGATIVE', 'INCONCLUSIVE') NOT NULL DEFAULT 'PENDING',
    `resultDate` DATE NULL,
    `remarks` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResponseActivity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `caseId` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `date` DATE NOT NULL,
    `personnel` VARCHAR(200) NULL,
    `remarks` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vaccination` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `farmId` INTEGER NOT NULL,
    `target` ENUM('GROUP', 'ANIMAL') NOT NULL DEFAULT 'GROUP',
    `groupId` INTEGER NULL,
    `animalId` INTEGER NULL,
    `species` VARCHAR(40) NOT NULL,
    `count` INTEGER NOT NULL,
    `vaccine` VARCHAR(120) NOT NULL,
    `date` DATE NOT NULL,
    `nextDate` DATE NULL,
    `doseNumber` INTEGER NOT NULL DEFAULT 1,
    `batch` VARCHAR(60) NULL,
    `administeredBy` VARCHAR(120) NULL,
    `remarks` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Vaccination_code_key`(`code`),
    INDEX `Vaccination_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity` VARCHAR(40) NOT NULL,
    `entityId` INTEGER NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `summary` VARCHAR(300) NOT NULL,
    `byName` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_entity_entityId_idx`(`entity`, `entityId`),
    INDEX `ActivityLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(60) NOT NULL,
    `value` TEXT NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PcicPolicy` ADD CONSTRAINT `PcicPolicy_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Farm` ADD CONSTRAINT `Farm_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PopulationGroup` ADD CONSTRAINT `PopulationGroup_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PopulationUpdate` ADD CONSTRAINT `PopulationUpdate_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `PopulationGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Animal` ADD CONSTRAINT `Animal_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `PopulationGroup`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OwnershipTransfer` ADD CONSTRAINT `OwnershipTransfer_animalId_fkey` FOREIGN KEY (`animalId`) REFERENCES `Animal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OwnershipTransfer` ADD CONSTRAINT `OwnershipTransfer_fromOwnerId_fkey` FOREIGN KEY (`fromOwnerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OwnershipTransfer` ADD CONSTRAINT `OwnershipTransfer_toOwnerId_fkey` FOREIGN KEY (`toOwnerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StrayIncident` ADD CONSTRAINT `StrayIncident_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiseaseCase` ADD CONSTRAINT `DiseaseCase_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiseaseCase` ADD CONSTRAINT `DiseaseCase_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiseaseCase` ADD CONSTRAINT `DiseaseCase_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseStatusHistory` ADD CONSTRAINT `CaseStatusHistory_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `DiseaseCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Investigation` ADD CONSTRAINT `Investigation_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `DiseaseCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LabRecord` ADD CONSTRAINT `LabRecord_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `DiseaseCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResponseActivity` ADD CONSTRAINT `ResponseActivity_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `DiseaseCase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vaccination` ADD CONSTRAINT `Vaccination_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vaccination` ADD CONSTRAINT `Vaccination_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `PopulationGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vaccination` ADD CONSTRAINT `Vaccination_animalId_fkey` FOREIGN KEY (`animalId`) REFERENCES `Animal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
