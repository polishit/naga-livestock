import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@livestock/shared';
import { prisma } from '../db';
import { env } from '../env';
import { HttpError } from '../lib/http';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const baseCookie = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
});

export function signAccessToken(u: AuthUser): string {
  return jwt.sign(
    { sub: String(u.id), role: u.role, name: u.name, email: u.email, title: u.title },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    },
  );
}

const hashToken = (t: string) => crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(t).digest('hex');

/** Issue a new opaque refresh token (rotated on every refresh). */
export async function issueRefreshToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400_000),
    },
  });
  return token;
}

export async function setAuthCookies(res: Response, u: AuthUser) {
  const access = signAccessToken(u);
  const refresh = await issueRefreshToken(u.id);
  res.cookie(ACCESS_COOKIE, access, { ...baseCookie(), path: '/', maxAge: 15 * 60_000 * 4 });
  res.cookie(REFRESH_COOKIE, refresh, {
    ...baseCookie(),
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_DAYS * 86400_000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: '/api/auth' });
}

/** Validate and rotate a refresh token; returns the user or null. */
export async function rotateRefreshToken(token: string): Promise<AuthUser | null> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.revokedAt || row.expiresAt < new Date() || !row.user.active) {
    // Reuse of a revoked token: revoke the whole family for safety.
    if (row?.revokedAt)
      await prisma.refreshToken.updateMany({
        where: { userId: row.userId },
        data: { revokedAt: new Date() },
      });
    return null;
  }
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return toAuthUser(row.user);
}

export async function revokeRefreshToken(token: string | undefined) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function toAuthUser(u: {
  id: number;
  name: string;
  email: string;
  role: Role;
  title: string | null;
}): AuthUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title };
}

/** Current role/active state per user, cached briefly so every request doesn't hit the database. */
const userState = new Map<
  number,
  { at: number; active: boolean; role: Role; name: string; title: string | null }
>();
const USER_STATE_TTL = 10_000;

/** Forget the cached state after an administrator changes a user. */
export function forgetUserState(id: number) {
  userState.delete(id);
}

async function currentState(id: number) {
  const hit = userState.get(id);
  if (hit && Date.now() - hit.at < USER_STATE_TTL) return hit;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { active: true, role: true, name: true, title: true },
  });
  const state = u
    ? { at: Date.now(), ...u }
    : { at: Date.now(), active: false, role: 'READONLY' as Role, name: '', title: null };
  userState.set(id, state);
  return state;
}

/**
 * Attach req.user when a valid access cookie (or Bearer token) is present. The role and active flag
 * come from the database, so deactivating or demoting a user takes effect immediately.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = req.cookies?.[ACCESS_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!token) return next();
  let p: jwt.JwtPayload;
  try {
    p = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  } catch {
    return next(); // expired or invalid — treated as anonymous
  }
  const id = Number(p.sub);
  currentState(id)
    .then((s) => {
      if (s.active) req.user = { id, name: s.name, email: p.email, role: s.role, title: s.title };
      next();
    })
    .catch(next);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Not authenticated'));
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role))
      return next(new HttpError(403, 'You do not have permission for this action'));
    next();
  };

/** Read-only users may only issue safe (GET/HEAD) requests. */
export function writeGuard(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.user?.role === 'READONLY')
    return next(new HttpError(403, 'Read-only accounts cannot make changes'));
  next();
}
