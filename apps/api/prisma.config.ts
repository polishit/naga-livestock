import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Read lazily so `prisma generate` works without a database configured.
    url: process.env.DATABASE_URL ?? 'mysql://livestock:livestock@localhost:3306/livestock',
  },
});
