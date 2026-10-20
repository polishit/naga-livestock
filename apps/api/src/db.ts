import { PrismaClient } from './generated/prisma/client.ts';
import { env } from './env';
import { adapterFromUrl } from './lib/adapter';

export const prisma = new PrismaClient({ adapter: adapterFromUrl(env.DATABASE_URL) });

export * from './generated/prisma/client.ts';
