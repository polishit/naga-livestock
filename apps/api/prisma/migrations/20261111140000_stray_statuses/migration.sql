-- Stray incidents now have two statuses: Reported (open) and Closed.
-- Impounded incidents are still open (Reported); released ones are finished (Closed).
UPDATE `StrayIncident` SET `status` = 'REPORTED' WHERE `status` = 'IMPOUNDED';
UPDATE `StrayIncident` SET `status` = 'CLOSED' WHERE `status` = 'RELEASED';

-- AlterTable
ALTER TABLE `StrayIncident` MODIFY `status` ENUM('REPORTED', 'CLOSED') NOT NULL DEFAULT 'REPORTED';
