-- Species list is now: Cattle, Carabao, Goat, Sheep, Pig, Chicken, Ducks, Goose.
-- Rename the old names in every table that stores a species.
UPDATE `PopulationGroup` SET `species` = 'Pig' WHERE `species` = 'Swine';
UPDATE `PopulationGroup` SET `species` = 'Ducks' WHERE `species` = 'Duck';
UPDATE `Animal` SET `species` = 'Pig' WHERE `species` = 'Swine';
UPDATE `Animal` SET `species` = 'Ducks' WHERE `species` = 'Duck';
UPDATE `StrayIncident` SET `species` = 'Pig' WHERE `species` = 'Swine';
UPDATE `StrayIncident` SET `species` = 'Ducks' WHERE `species` = 'Duck';
UPDATE `DiseaseCase` SET `species` = 'Pig' WHERE `species` = 'Swine';
UPDATE `DiseaseCase` SET `species` = 'Ducks' WHERE `species` = 'Duck';
UPDATE `LabRecord` SET `species` = 'Pig' WHERE `species` = 'Swine';
UPDATE `LabRecord` SET `species` = 'Ducks' WHERE `species` = 'Duck';
UPDATE `Vaccination` SET `species` = 'Pig' WHERE `species` = 'Swine';
UPDATE `Vaccination` SET `species` = 'Ducks' WHERE `species` = 'Duck';
UPDATE `PcicPolicy` SET `species` = 'Pig' WHERE `species` = 'Swine';
UPDATE `PcicPolicy` SET `species` = 'Ducks' WHERE `species` = 'Duck';
-- Yearly vaccination targets are kept as JSON text in Setting.
UPDATE `Setting` SET `value` = REPLACE(REPLACE(`value`, '"species":"Swine"', '"species":"Pig"'), '"species":"Duck"', '"species":"Ducks"')
WHERE `key` LIKE 'vaccinationTargets:%';

-- Population monitoring uses head counts only: no life stage or age/sex/stage classification.
ALTER TABLE `PopulationGroup` DROP COLUMN `lifeStage`,
    DROP COLUMN `breakdown`;

-- Stray violations no longer record a fine or penalty.
ALTER TABLE `StrayIncident` DROP COLUMN `fineAmount`,
    DROP COLUMN `finePaid`,
    DROP COLUMN `orNumber`,
    DROP COLUMN `paidAt`;
