import * as Sentry from '@sentry/node';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { MulterError } from 'multer';
import { MAX_PHOTO_MB } from '@livestock/shared';
import { authenticate, requireAuth, requireRole, writeGuard } from './auth/auth';
import { prisma } from './db';
import { env } from './env';
import { HttpError } from './lib/http';
import { animalsRouter, straysRouter, transfersRouter } from './routes/animals';
import { casesRouter, labsRouter, radiusRouter } from './routes/cases';
import { farmsRouter } from './routes/farms';
import {
  authRouter,
  filesRouter,
  metricsRouter,
  settingsRouter,
  uploadsRouter,
  usersRouter,
} from './routes/misc';
import { ownersRouter } from './routes/owners';
import { populationRouter } from './routes/population';
import { vaccinationsRouter } from './routes/vaccinations';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  /** Uptime check: verifies the process and the database. */
  app.get(['/health', '/api/health'], async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'unreachable' });
    }
  });

  app.use(authenticate);
  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth, writeGuard);
  api.use('/owners', ownersRouter);
  api.use('/farms', farmsRouter);
  api.use('/population', populationRouter);
  api.use('/animals', animalsRouter);
  api.use('/transfers', transfersRouter);
  api.use('/strays', straysRouter);
  api.use('/cases', casesRouter);
  api.use('/labs', labsRouter);
  api.use('/radius', radiusRouter);
  api.use('/vaccinations', vaccinationsRouter);
  api.use('/users', requireRole('ADMIN'), usersRouter);
  api.use('/settings', settingsRouter);
  api.use('/uploads', uploadsRouter);
  api.use('/files', filesRouter);
  api.use('/', metricsRouter);
  app.use('/api', api);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res
        .status(err.status)
        .json({ error: err.message, ...(err.details ? (err.details as object) : {}) });
    }
    if (err instanceof MulterError) {
       return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? `Each photo must be ${MAX_PHOTO_MB} MB or smaller` : err.message,
      });
    }
    const e = err as { code?: string; meta?: unknown; message?: string };
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    if (e?.code === 'P2002')
      return res.status(409).json({ error: 'A record with this value already exists' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
