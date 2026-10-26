import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);

/** Wrap an async route so rejections reach the error handler. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Parse and validate a body/query with a Zod schema, throwing 400 with field errors. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fieldErrors = r.error.flatten().fieldErrors;
    throw new HttpError(400, 'Validation failed', { fieldErrors });
  }
  return r.data;
}

/**
 * For PATCH: only the fields actually sent are changed. A field sent blank clears it (null);
 * a field left out of the request keeps its current value.
 */
export function sent<T extends Record<string, unknown>, K extends keyof T>(
  body: unknown,
  d: T,
  keys: readonly K[],
): { [P in K]?: Exclude<T[P], undefined> | null } {
  const out: Record<string, unknown> = {};
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(b, k)) out[k as string] = d[k] ?? null;
  return out as { [P in K]?: Exclude<T[P], undefined> | null };
}

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}`);
  return n;
}

export function qstr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' && v !== 'all' ? v.trim() : undefined;
}
