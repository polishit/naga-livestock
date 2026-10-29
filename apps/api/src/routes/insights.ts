import { Router } from 'express';
import { vaccinationTargetsSchema } from '@livestock/shared';
import { requireRole } from '../auth/auth';
import { logActivity } from '../lib/activity';
import { ah, parse, qstr } from '../lib/http';
import {
  comparePeriods,
  dataQuality,
  hotspots,
  saveTargets,
  targetProgress,
  taskList,
} from '../services/insights';

/** Analytics extras (comparison, hotspots, data quality, targets) and the staff task list. */
export const insightsRouter = Router();

insightsRouter.get(
  '/compare',
  ah(async (req, res) => {
    res.json(
      await comparePeriods({
        barangay: qstr(req.query.barangay),
        species: qstr(req.query.species),
        months: Number(req.query.months) || 6,
      }),
    );
  }),
);

insightsRouter.get(
  '/hotspots',
  ah(async (_req, res) => {
    res.json(await hotspots());
  }),
);

insightsRouter.get(
  '/data-quality',
  ah(async (req, res) => {
    res.json(await dataQuality({ barangay: qstr(req.query.barangay) }));
  }),
);

insightsRouter.get(
  '/vaccination-targets',
  ah(async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    res.json(await targetProgress(year));
  }),
);

insightsRouter.put(
  '/vaccination-targets',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const d = parse(vaccinationTargetsSchema, req.body);
    await saveTargets(d.year, d.targets);
    await logActivity('settings', 0, 'updated', `Vaccination targets for ${d.year} updated`, req.user?.name);
    res.json(await targetProgress(d.year));
  }),
);

insightsRouter.get(
  '/tasks',
  ah(async (_req, res) => {
    const tasks = await taskList();
    res.json({ count: tasks.length, overdue: tasks.filter((t) => t.overdue).length, tasks });
  }),
);