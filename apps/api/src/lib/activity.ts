import { code as fmtCode } from '@livestock/shared';
import { prisma } from '../db';

type Tx = Pick<typeof prisma, 'activityLog'>;

export async function logActivity(
  entity: string,
  entityId: number,
  action: string,
  summary: string,
  byName?: string | null,
  tx: Tx = prisma,
) {
  await tx.activityLog.create({ data: { entity, entityId, action, summary, byName: byName ?? null } });
}

/** Replace a temporary code with the padded display code after insert. */
export function displayCode(prefix: string, id: number) {
  return fmtCode(prefix, id);
}

export function tempCode() {
  return `TMP-${Math.random().toString(36).slice(2, 12)}`;
}
