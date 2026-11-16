import { PrismaClient } from './generated/prisma/client.ts';
import { env } from './env';
import { adapterFromUrl } from './lib/adapter';
import { auditExtension, writeAudit, type AuditActor } from './lib/audit';

/** The plain client: used by the audit trail itself, so that writing the log is not audited again. */
export const basePrisma = new PrismaClient({ adapter: adapterFromUrl(env.DATABASE_URL) });

/**
 * The client the application uses. Every create and update goes through the audit extension, which
 * records who changed what, with the old and new values (see lib/audit.ts).
 */
export const prisma = basePrisma.$extends(auditExtension(basePrisma)) as unknown as PrismaClient;

/** Record a security or system event (sign-in, lockout, password reset, export…). */
export const audit = (e: {
  tableName: string;
  recordId: string | number;
  action: string;
  changes?: unknown;
  note?: string | null;
  actor?: AuditActor;
}) => writeAudit(basePrisma, e);

export * from './generated/prisma/client.ts';
