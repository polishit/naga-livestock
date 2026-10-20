import { execSync } from 'node:child_process';

export default function setup() {
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'mysql://livestock:livestock@localhost:3306/livestock_test',
  };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'inherit' });
  execSync('pnpm exec tsx prisma/seed.ts', { env, stdio: 'inherit' });
}
