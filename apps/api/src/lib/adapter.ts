import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/** Build MariaDB-connector options from a mysql:// URL (works with MySQL 8). */
export function adapterFromUrl(url: string) {
  const u = new URL(url);
  return new PrismaMariaDb({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    connectionLimit: Number(u.searchParams.get('connection_limit') ?? 10),
    // MySQL 8 defaults to caching_sha2_password.
    allowPublicKeyRetrieval: true,
  });
}
