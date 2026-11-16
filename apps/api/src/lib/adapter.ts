import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';

/** Build MariaDB-connector options from a mysql:// URL (works with MySQL 8). */
export function adapterFromUrl(url: string) {
  const u = new URL(url);
  // ?sslaccept=strict (certificate checked) or ?sslaccept=accept_invalid_certs (encrypted, not checked)
  const sslaccept = u.searchParams.get('sslaccept');
  return new PrismaMariaDb({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    connectionLimit: Number(u.searchParams.get('connection_limit') ?? 10),
    // MySQL 8 defaults to caching_sha2_password.
    allowPublicKeyRetrieval: true,
    // A far-away database needs more than the default 1 second to finish the secure (TLS) handshake.
    connectTimeout: 10_000,
    ...(sslaccept ? { ssl: { rejectUnauthorized: sslaccept === 'strict' } } : {}),
  });
}

/**
 * Run statements that the prepared-statement protocol does not accept (CREATE TRIGGER, DROP TRIGGER)
 * on a short-lived plain connection. Returns the rows of the last statement.
 */
export async function runPlainSql(url: string, statements: string[]): Promise<unknown[]> {
  const u = new URL(url);
  const sslaccept = u.searchParams.get('sslaccept');
  const conn = await mariadb.createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    allowPublicKeyRetrieval: true,
    connectTimeout: 10_000,
    ...(sslaccept ? { ssl: { rejectUnauthorized: sslaccept === 'strict' } } : {}),
  });
  try {
    let last: unknown[] = [];
    for (const sql of statements) last = (await conn.query(sql)) as unknown[];
    return Array.isArray(last) ? last : [];
  } finally {
    await conn.end();
  }
}

/** The audit tables are append-only: the database refuses UPDATE and DELETE on them. */
export const AUDIT_LOCKED_TABLES = ['AuditEntry', 'ActivityLog'] as const;

/** Lift the audit lock. Only the seed scripts do this, to rebuild a database from zero. */
export async function dropAuditLock(url: string) {
  await runPlainSql(
    url,
    AUDIT_LOCKED_TABLES.flatMap((t) =>
      ['update', 'delete'].map((op) => `DROP TRIGGER IF EXISTS \`${t}_no_${op}\``),
    ),
  );
}
