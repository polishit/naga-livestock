import * as Sentry from '@sentry/node';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { autoZones } from './services/ownerSide';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { MulterError } from 'multer';
import { MAX_PHOTO_MB } from '@livestock/shared';
import { authenticate, passwordChanged, requireAuth, requireRole, staffOnly } from './auth/auth';
import { auditContext, ensureAuditLock } from './lib/audit';
import { prisma } from './db';
import { env } from './env';
import { HttpError } from './lib/http';
import { animalsRouter, straysRouter, transfersRouter } from './routes/animals';
import { casesRouter, labsRouter, radiusRouter, recordsRouter } from './routes/cases';
import { labSubmissionsRouter } from './routes/labSubmissions';
import { insightsRouter } from './routes/insights';
import { recordActionsRouter } from './routes/recordActions';
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
import { visitsRouter } from './routes/visits';
import { vaccinationsRouter } from './routes/vaccinations';
import { auditRouter } from './routes/audit';
import { myRouter } from './routes/my';
import { reviewRouter } from './routes/ownerReview';
import { activitiesRouter, announcementsRouter, publicRouter, zonesRouter } from './routes/outreach';

export function createApp() {
  const app = express();
  // Make the audit tables append-only in the database (once; does nothing if already done).
  void ensureAuditLock(env.DATABASE_URL);
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
    } catch (e) {
      console.error('Health check: database unreachable', e);
      res.status(503).json({ status: 'degraded', db: 'unreachable' });
    }
  });

  app.use(authenticate);
  // Everything after this runs with the signed-in user as the author of the audit trail.
  app.use(auditContext);
  app.use('/api/auth', authRouter);
  // Public information: no sign-in, no personal data.
  app.use('/api/public', publicRouter);
  // The owner app: livestock owners only, each limited to their own records.
  app.use('/api/my', requireAuth, passwordChanged, myRouter);

  const api = express.Router();
  // The CVO system: staff accounts only, and never with a temporary password still in use.
  api.use(requireAuth, staffOnly, passwordChanged);
  // Delete (entered by mistake), void, restore and edit actions on the records below.
  // A lab result, a map location or a voided case can confirm or un-confirm a case: its monitoring
  // zone follows before the answer is sent (so the CVO does it in one step, not two).
  api.use((req, res, next) => {
    if (req.method === 'GET' || !/^\/(cases|labs|lab-submissions|farms)(\/|$)/.test(req.path)) return next();
    const send = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 400) return send(body);
      autoZones(req.user?.name)
        .catch((e) => console.error('Automatic monitoring zone failed', e))
        .finally(() => send(body));
      return res;
    }) as typeof res.json;
    next();
  });
  api.use('/', recordActionsRouter);
  api.use('/owners', ownersRouter);
  api.use('/farms', farmsRouter);
  api.use('/population', populationRouter);
  api.use('/animals', animalsRouter);
  api.use('/transfers', transfersRouter);
  api.use('/strays', straysRouter);
  api.use('/cases', casesRouter);
  api.use('/labs', labsRouter);
  api.use('/lab-submissions', labSubmissionsRouter);
  api.use('/radius', radiusRouter);
  api.use('/', recordsRouter);
  api.use('/vaccinations', vaccinationsRouter);
  api.use('/farm-visits', visitsRouter);
  api.use('/users', requireRole('ADMIN'), usersRouter);
  api.use('/settings', settingsRouter);
  api.use('/audit', auditRouter);
  api.use('/review', reviewRouter);
  api.use('/zones', zonesRouter);
  api.use('/activities', activitiesRouter);
  api.use('/announcements', announcementsRouter);
  api.use('/insights', insightsRouter);
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
        error:
          err.code === 'LIMIT_FILE_SIZE' ? `Each photo must be ${MAX_PHOTO_MB} MB or smaller` : err.message,
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
