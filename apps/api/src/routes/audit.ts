import { Router } from 'express';
import { z } from 'zod';
import { requireReviewer, requireRole } from '../auth/auth';
import { audit, basePrisma } from '../db';
import { env } from '../env';
import { auditLockState, ensureAuditLock } from '../lib/audit';
import { ah, parse, qstr } from '../lib/http';

/**
 * The audit log: read-only. There is no route that edits or deletes an entry, and the database
 * refuses it as well (see lib/audit.ts).
 */
export const auditRouter = Router();

const PAGE = 50;

/** Administrator: the whole log, newest first, with filters. */
auditRouter.get(
  '/',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    // Check (and put back, if a rebuild lifted it) the database lock on the log.
    await ensureAuditLock(env.DATABASE_URL);
    const table = qstr(req.query.table);
    const action = qstr(req.query.action);
    const recordId = qstr(req.query.recordId);
    const userId = Number(qstr(req.query.userId)) || undefined;
    const from = qstr(req.query.from);
    const to = qstr(req.query.to);
    const q = qstr(req.query.q);
    const page = Math.max(1, Number(qstr(req.query.page)) || 1);
    const where = {
      ...(table ? { tableName: table } : {}),
      ...(action ? { action } : {}),
      ...(recordId ? { recordId } : {}),
      ...(userId ? { userId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00+08:00`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999+08:00`) } : {}),
            },
          }
        : {}),
      ...(q ? { OR: [{ byName: { contains: q } }, { note: { contains: q } }, { recordId: q }] } : {}),
    };
    const [total, rows, tables, users] = await Promise.all([
      basePrisma.auditEntry.count({ where }),
      basePrisma.auditEntry.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * PAGE,
        take: PAGE,
      }),
      basePrisma.auditEntry.groupBy({ by: ['tableName'], orderBy: { tableName: 'asc' } }),
      basePrisma.auditEntry.groupBy({ by: ['userId', 'byName'], where: { userId: { not: null } } }),
    ]);
    res.json({
      total,
      page,
      pageSize: PAGE,
      rows,
      tables: tables.map((t) => t.tableName),
      users: users.map((u) => ({ id: u.userId, name: u.byName })),
      // Whether the database itself refuses changes to the log (triggers in place).
      databaseLock: auditLockState(),
    });
  }),
);

/** Reviewers: the full history of one record (every change, oldest first). */
auditRouter.get(
  '/record/:table/:id',
  requireReviewer,
  ah(async (req, res) => {
    const rows = await basePrisma.auditEntry.findMany({
      where: { tableName: String(req.params.table), recordId: String(req.params.id) },
      orderBy: { id: 'asc' },
    });
    res.json(rows);
  }),
);

const exportLogSchema = z.object({
  report: z.string().trim().min(1).max(120),
  format: z.enum(['XLSX', 'CSV', 'PDF', 'PRINT']),
  rows: z.coerce.number().int().min(0).max(10_000_000).optional(),
  filters: z.string().trim().max(200).optional(),
});

/** Every export or print of a report is logged with who, when and what. */
auditRouter.post(
  '/export',
  ah(async (req, res) => {
    const d = parse(exportLogSchema, req.body);
    await audit({
      tableName: 'Report',
      recordId: d.report.slice(0, 60),
      action: 'EXPORT',
      note: `${d.report} exported as ${d.format}${d.rows != null ? ` (${d.rows} rows)` : ''}${d.filters ? ` — ${d.filters}` : ''}`,
    });
    res.status(201).json({ ok: true });
  }),
);
