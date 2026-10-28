-- AlterTable
ALTER TABLE `Farm` ADD COLUMN `pastureLat` DOUBLE NULL,
    ADD COLUMN `pastureLng` DOUBLE NULL,
    ADD COLUMN `pastureLocation` VARCHAR(250) NULL;

-- AlterTable
ALTER TABLE `StrayIncident` ADD COLUMN `fineAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `finePaid` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `impoundPlace` VARCHAR(200) NULL,
    ADD COLUMN `impoundedAt` DATE NULL,
    ADD COLUMN `orNumber` VARCHAR(40) NULL,
    ADD COLUMN `paidAt` DATE NULL,
    ADD COLUMN `releasedAt` DATE NULL,
    ADD COLUMN `releasedTo` VARCHAR(150) NULL,
    ADD COLUMN `violationType` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `_PcicInsuredAnimals` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_PcicInsuredAnimals_AB_unique`(`A`, `B`),
    INDEX `_PcicInsuredAnimals_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_PcicInsuredAnimals` ADD CONSTRAINT `_PcicInsuredAnimals_A_fkey` FOREIGN KEY (`A`) REFERENCES `Animal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_PcicInsuredAnimals` ADD CONSTRAINT `_PcicInsuredAnimals_B_fkey` FOREIGN KEY (`B`) REFERENCES `PcicPolicy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
