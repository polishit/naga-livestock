import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Migrate and seed the isolated e2e database before the suite runs. */
export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'mysql://livestock:livestock@localhost:3306/livestock_test',
  };
  const api = path.join(root, 'apps/api');
  execSync('pnpm exec prisma migrate deploy', { cwd: api, env, stdio: 'inherit' });
  execSync('pnpm exec tsx prisma/seed.ts', { cwd: api, env, stdio: 'inherit' });
}
