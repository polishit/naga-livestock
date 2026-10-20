-- Test database used by Vitest integration tests and Playwright e2e runs.
CREATE DATABASE IF NOT EXISTS livestock_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON livestock_test.* TO 'livestock'@'%';
-- Prisma Migrate needs to create a temporary shadow database during `migrate dev`.
GRANT CREATE, ALTER, DROP, REFERENCES ON *.* TO 'livestock'@'%';
FLUSH PRIVILEGES;