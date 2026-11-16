import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '../generated/prisma/client.ts';
import { AUDIT_LOCKED_TABLES, runPlainSql } from './adapter';

/**
 * Field-level audit trail.
 *
 * Every create and update made through Prisma writes one AuditEntry row with the table, the record,
 * who did it, when, and the old and new value of each changed field. It is written by a Prisma
 * extension (see db.ts), so no route can forget it. Security events (sign-in, lockout, password
 * reset, export) are written with `audit()`.
 *
 * The table is append-only: the application has no route that edits or deletes it, and the database
 * itself refuses UPDATE and DELETE on it through triggers (see `ensureAuditLock`).
 */

export interface AuditActor {
  userId: number | null;
  name: string | null;
  /** web = CVO system, owner = owner app, system = automatic */
  source: 'web' | 'owner' | 'system';
}

const store = new AsyncLocalStorage<AuditActor>();
export const SYSTEM_ACTOR: AuditActor = { userId: null, name: 'System', source: 'system' };
export const currentActor = (): AuditActor => store.getStore() ?? SYSTEM_ACTOR;

/** Run the rest of the request with the signed-in user as the audit actor. */
export function auditContext(req: Request, _res: Response, next: NextFunction) {
  const u = req.user;
  store.run(
    u
      ? { userId: u.id, name: u.name, source: u.role === 'OWNER' ? 'owner' : 'web' }
      : { userId: null, name: null, source: 'web' },
    () => next(),
  );
}

/** Run a block as another actor (for example the system accepting an update automatically). */
export const runAs = <T>(actor: AuditActor, fn: () => Promise<T>) => store.run(actor, fn);

/** Tables that are not audited (the audit tables themselves and login tokens). */
const SKIP_MODELS = new Set(['AuditEntry', 'ActivityLog', 'RefreshToken']);
/** Bookkeeping fields that change on every write and say nothing. */
const SKIP_FIELDS = new Set(['updatedAt', 'lastLoginAt', 'failedLogins', 'lockedUntil']);
/** Fields whose value must never be copied into the log. */
const SECRET_FIELDS = new Set(['passwordHash', 'tokenHash']);

const plain = (v: unknown): unknown => {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (v && typeof v === 'object') {
    // Prisma Decimal and JSON values
    const s = (v as { toJSON?: () => unknown }).toJSON?.() ?? v;
    return typeof s === 'object' ? JSON.parse(JSON.stringify(s)) : s;
  }
  return v;
};
const same = (a: unknown, b: unknown) => JSON.stringify(plain(a)) === JSON.stringify(plain(b));
const scalarEntries = (row: Record<string, unknown>) =>
  Object.entries(row).filter(
    ([k, v]) =>
      !SKIP_FIELDS.has(k) && (v === null || typeof v !== 'object' || v instanceof Date || !Array.isArray(v)),
  );

/** { field: [old, new] } for the fields that differ. */
export function diffRows(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of scalarEntries(after)) {
    if (!(k in before)) continue;
    // Relations loaded with `include` are objects without a scalar counterpart: skip them.
    if (v && typeof v === 'object' && !(v instanceof Date) && !('toJSON' in (v as object))) continue;
    if (same(before[k], v)) continue;
    out[k] = SECRET_FIELDS.has(k) ? ['(hidden)', '(changed)'] : [plain(before[k]), plain(v)];
  }
  return out;
}

const createdValues = (row: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of scalarEntries(row)) {
    if (v === null || v === '' || k === 'createdAt') continue;
    if (v && typeof v === 'object' && !(v instanceof Date) && !('toJSON' in (v as object))) continue;
    out[k] = SECRET_FIELDS.has(k) ? '(hidden)' : plain(v);
  }
  return out;
};

const recordKey = (row: Record<string, unknown> | null | undefined) =>
  row ? String(row.id ?? row.key ?? row.code ?? '') : '';

type Delegate = {
  findUnique: (a: { where: unknown }) => Promise<Record<string, unknown> | null>;
};
const delegate = (base: PrismaClient, model: string) =>
  (base as unknown as Record<string, Delegate>)[model.charAt(0).toLowerCase() + model.slice(1)];

/** Write one audit row. Never throws: a failed log must not break the user's action. */
export async function writeAudit(
  base: PrismaClient,
  e: {
    tableName: string;
    recordId: string | number;
    action: string;
    changes?: unknown;
    note?: string | null;
    actor?: AuditActor;
  },
) {
  const a = e.actor ?? currentActor();
  try {
    await base.auditEntry.create({
      data: {
        tableName: e.tableName,
        recordId: String(e.recordId),
        action: e.action,
        changes: (e.changes ?? undefined) as never,
        note: e.note?.slice(0, 300) ?? null,
        userId: a.userId,
        byName: a.name,
        source: a.source,
      },
    });
  } catch (err) {
    console.error('Audit entry could not be written', err);
  }
}

/**
 * The Prisma extension: wraps create, update and upsert on every model. The old row is read before
 * the change and compared with the row returned by it.
 */
export function auditExtension(base: PrismaClient) {
  const audited = (model: string | undefined): model is string => !!model && !SKIP_MODELS.has(model);
  return {
    name: 'audit',
    query: {
      $allModels: {
        async create({ model, args, query }: any) {
          const row = await query(args);
          if (audited(model) && row && typeof row === 'object')
            await writeAudit(base, {
              tableName: model,
              recordId: recordKey(row),
              action: 'CREATE',
              changes: createdValues(row),
            });
          return row;
        },
        async update({ model, args, query }: any) {
          if (!audited(model)) return query(args);
          const before = await delegate(base, model)
            .findUnique({ where: args.where })
            .catch(() => null);
          const row = await query(args);
          if (before && row && typeof row === 'object') {
            const changes = diffRows(before, row as Record<string, unknown>);
            if (Object.keys(changes).length)
              await writeAudit(base, {
                tableName: model,
                recordId: recordKey(before),
                action: 'UPDATE',
                changes,
              });
          }
          return row;
        },
        async upsert({ model, args, query }: any) {
          if (!audited(model)) return query(args);
          const before = await delegate(base, model)
            .findUnique({ where: args.where })
            .catch(() => null);
          const row = await query(args);
          if (row && typeof row === 'object') {
            if (!before)
              await writeAudit(base, {
                tableName: model,
                recordId: recordKey(row),
                action: 'CREATE',
                changes: createdValues(row),
              });
            else {
              const changes = diffRows(before, row as Record<string, unknown>);
              if (Object.keys(changes).length)
                await writeAudit(base, {
                  tableName: model,
                  recordId: recordKey(before),
                  action: 'UPDATE',
                  changes,
                });
            }
          }
          return row;
        },
      },
    },
  };
}

let lockState: 'unknown' | 'on' | 'off' = 'unknown';
export const auditLockState = () => lockState;

/**
 * Make the audit tables append-only in the database: a trigger refuses every UPDATE and DELETE, so
 * not even the administrator (or someone with the application's database login) can change the log.
 * Created once; if the database login is not allowed to create triggers, the application still has
 * no way to edit the log, and the Audit Log page says the database lock is off.
 */
export async function ensureAuditLock(url: string) {
  try {
    const existing = (await runPlainSql(url, [
      'SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()',
    ])) as { name: string }[];
    const have = new Set(existing.map((t) => t.name));
    const create: string[] = [];
    for (const t of AUDIT_LOCKED_TABLES)
      for (const op of ['UPDATE', 'DELETE'] as const) {
        const name = `${t}_no_${op.toLowerCase()}`;
        if (!have.has(name))
          create.push(
            `CREATE TRIGGER \`${name}\` BEFORE ${op} ON \`${t}\` FOR EACH ROW ` +
              `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The audit log cannot be changed or deleted'`,
          );
      }
    if (create.length) await runPlainSql(url, create);
    lockState = 'on';
  } catch (err) {
    lockState = 'off';
    console.warn('Audit log database lock could not be created:', (err as Error).message);
  }
}
