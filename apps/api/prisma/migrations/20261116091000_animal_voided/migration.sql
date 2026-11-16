-- An animal registered by mistake is marked Voided (kept, never deleted).
ALTER TABLE `Animal` MODIFY `status` ENUM('ACTIVE', 'SOLD', 'DECEASED', 'MISSING', 'SLAUGHTERED', 'VOIDED') NOT NULL DEFAULT 'ACTIVE';
