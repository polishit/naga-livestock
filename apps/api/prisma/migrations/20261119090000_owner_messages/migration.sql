-- CreateTable
CREATE TABLE `OwnerMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `fromOwner` BOOLEAN NOT NULL,
    `byName` VARCHAR(120) NOT NULL,
    `byUserId` INTEGER NULL,
    `text` TEXT NOT NULL,
    `photoKeys` JSON NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OwnerMessage_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    INDEX `OwnerMessage_fromOwner_readAt_idx`(`fromOwner`, `readAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OwnerMessage` ADD CONSTRAINT `OwnerMessage_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `Owner`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
