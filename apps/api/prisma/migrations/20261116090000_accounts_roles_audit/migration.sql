-- Staff roles become System Administrator, Veterinarian (reviewer) and Field Technician, and
-- livestock owners get their own role. Staff -> Veterinarian, Viewer -> Field Technician.
ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'STAFF', 'READONLY', 'VETERINARIAN', 'TECHNICIAN', 'OWNER') NOT NULL DEFAULT 'STAFF';
UPDATE `User` SET `role` = 'VETERINARIAN' WHERE `role` = 'STAFF';
UPDATE `User` SET `role` = 'TECHNICIAN' WHERE `role` = 'READONLY';
ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'VETERINARIAN', 'TECHNICIAN', 'OWNER') NOT NULL DEFAULT 'TECHNICIAN';

-- Accounts are never deleted: Active, Suspended or Deactivated.
ALTER TABLE `User`
  ADD COLUMN `status` ENUM('ACTIVE', 'SUSPENDED', 'DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
  ADD COLUMN `failedLogins` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lockedUntil` DATETIME(3) NULL,
  ADD COLUMN `ownerId` INTEGER NULL;
UPDATE `User` SET `status` = 'DEACTIVATED' WHERE `active` = false;
ALTER TABLE `User` DROP COLUMN `active`;
CREATE UNIQUE INDEX `User_ownerId_key` ON `User`(`ownerId`);
ALTER TABLE `User` ADD CONSTRAINT `User_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- A farm visit entered in error is voided (kept and marked), not deleted.
ALTER TABLE `FarmVisit`
  ADD COLUMN `voidedAt` DATETIME(3) NULL,
  ADD COLUMN `voidedBy` VARCHAR(120) NULL,
  ADD COLUMN `voidReason` VARCHAR(300) NULL;

-- Field-level audit trail.
CREATE TABLE `AuditEntry` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tableName` VARCHAR(40) NOT NULL,
  `recordId` VARCHAR(60) NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `changes` JSON NULL,
  `note` VARCHAR(300) NULL,
  `userId` INTEGER NULL,
  `byName` VARCHAR(120) NULL,
  `source` VARCHAR(20) NOT NULL DEFAULT 'web',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuditEntry_tableName_recordId_idx`(`tableName`, `recordId`),
  INDEX `AuditEntry_createdAt_idx`(`createdAt`),
  INDEX `AuditEntry_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
