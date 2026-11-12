-- "Awaiting Result" is merged into "Sent to Laboratory" (they meant the same thing).
UPDATE `DiseaseCase` SET `status` = 'SENT_TO_LAB' WHERE `status` = 'AWAITING_RESULT';
UPDATE `CaseStatusHistory` SET `status` = 'SENT_TO_LAB' WHERE `status` = 'AWAITING_RESULT';
ALTER TABLE `DiseaseCase` MODIFY `status` ENUM('SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'POSITIVE', 'NEGATIVE') NOT NULL DEFAULT 'SUSPECTED';
ALTER TABLE `CaseStatusHistory` MODIFY `status` ENUM('SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'POSITIVE', 'NEGATIVE') NOT NULL;

-- The status of an open case now follows from its laboratory samples (voided samples left out).
UPDATE `DiseaseCase` c SET c.`status` = CASE
  WHEN EXISTS (SELECT 1 FROM `LabRecord` l WHERE l.`caseId` = c.`id` AND l.`voidedAt` IS NULL AND l.`result` = 'POSITIVE') THEN 'POSITIVE'
  WHEN EXISTS (SELECT 1 FROM `LabRecord` l WHERE l.`caseId` = c.`id` AND l.`voidedAt` IS NULL AND l.`result` = 'PENDING' AND l.`sentAt` IS NOT NULL) THEN 'SENT_TO_LAB'
  WHEN EXISTS (SELECT 1 FROM `LabRecord` l WHERE l.`caseId` = c.`id` AND l.`voidedAt` IS NULL AND l.`result` = 'PENDING') THEN 'SAMPLE_COLLECTED'
  WHEN EXISTS (SELECT 1 FROM `LabRecord` l WHERE l.`caseId` = c.`id` AND l.`voidedAt` IS NULL AND l.`result` = 'NEGATIVE') THEN 'NEGATIVE'
  ELSE 'SUSPECTED'
END
WHERE c.`closedAt` IS NULL;
