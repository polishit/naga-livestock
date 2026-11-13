import crypto from 'node:crypto';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {
  BARANGAYS,
  CASE_CLASS_LABELS,
  caseClass,
  titleCase,
  MAX_PHOTO_MB,
  OFFICE_NAME,
  REPORT_TYPES,
  RESPONSE_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
  fmtDate,
  loginSchema,
  settingsSchema,
  userCreateSchema,
  userUpdateSchema,
  type ResponseType,
  type ServiceType,
} from '@livestock/shared';
import { monthlySummary } from '../services/monthly';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  forgetUserState,
  requireAuth,
  requireRole,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
  toAuthUser,
} from '../auth/auth';
import { prisma } from '../db';
import { env } from '../env';
import { logActivity } from '../lib/activity';
import { today, ymd } from '../lib/dates';
import { HttpError, ah, badRequest, idParam, parse, qstr } from '../lib/http';
import { storage } from '../storage';
import { loadCases, loadFarms, overview, summarizeFarm } from '../services/metrics';
import { buildOutbreakReport, buildReport } from '../services/reports';
import { getSettings, saveSettings } from '../services/settings';
import { liveReminder } from './vaccinations';

/* ---------------- auth ---------------- */

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.NODE_ENV === 'production' ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
});

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Incorrect email or password');
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const au = toAuthUser(user);
    await setAuthCookies(res, au);
    res.json({ user: au });
  }),
);

authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    const user = token ? await rotateRefreshToken(token) : null;
    if (!user) {
      clearAuthCookies(res);
      throw new HttpError(401, 'Session expired');
    }
    await setAuthCookies(res, user);
    res.json({ user });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* ---------------- users (admin) ---------------- */

export const usersRouter = Router();

usersRouter.get(
  '/',
  ah(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        title: u.title,
        role: u.role,
        active: u.active,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
    );
  }),
);

usersRouter.post(
  '/',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const d = parse(userCreateSchema, req.body);
    const exists = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } });
    if (exists) throw badRequest('Validation failed', { fieldErrors: { email: ['Email already in use'] } });
    const u = await prisma.user.create({
      data: {
        name: d.name,
        email: d.email.toLowerCase(),
        role: d.role,
        title: d.title ?? null,
        passwordHash: await bcrypt.hash(d.password, 10),
      },
    });
    await logActivity(
      'user',
      u.id,
      'created',
      `User ${u.email} created (${u.role.toLowerCase()})`,
      req.user?.name,
    );
    res.status(201).json({ id: u.id, name: u.name, email: u.email, role: u.role });
  }),
);

usersRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = idParam(req);
    const d = parse(userUpdateSchema, req.body);
    if (id === req.user!.id && (d.active === false || (d.role && d.role !== 'ADMIN'))) {
      throw badRequest('You cannot deactivate or demote your own account');
    }
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'User not found');
    const u = await prisma.user.update({
      where: { id },
      data: {
        ...(d.name ? { name: d.name } : {}),
        ...(d.role ? { role: d.role } : {}),
        ...(d.title !== undefined ? { title: d.title ?? null } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 10) } : {}),
      },
    });
    // Deactivation, a new password or a new role signs the user out of every session, so the
    // change takes effect at once (they sign in again with the new role).
    if (d.active === false || d.password || (d.role && d.role !== before.role))
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    forgetUserState(id);
    await logActivity('user', id, 'updated', `User ${u.email} updated`, req.user?.name);
    res.json({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });
  }),
);

/* ---------------- dashboard, analytics, reports ---------------- */

export const metricsRouter = Router();

/* ---------------- reverse geocoding (click on the map → address) ---------------- */

const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^(barangay|brgy\.?)\s+/, '')
    .trim();

/** Which of the city's barangays a place name refers to (accents and "Brgy." ignored). */
export function matchBarangay(...names: (string | undefined)[]) {
  for (const n of names) {
    if (!n) continue;
    const hit = BARANGAYS.find((b) => normalizeName(b) === normalizeName(n));
    if (hit) return hit;
  }
  return null;
}

const geoCache = new Map<string, { address: string; barangay: string | null }>();
let geoQueue: Promise<unknown> = Promise.resolve();
let lastGeocodeAt = 0;

export async function reverseGeocode(lat: number, lng: number) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = geoCache.get(key);
  if (cached) return cached;
  // OpenStreetMap's Nominatim allows at most one request per second, so lookups wait their turn.
  const run = geoQueue.then(async () => {
    const wait = lastGeocodeAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGeocodeAt = Date.now();
    const url =
      `${env.GEOCODER_URL.replace(/\/$/, '')}/reverse?format=jsonv2&addressdetails=1&zoom=18` +
      `&accept-language=en&lat=${lat}&lon=${lng}`;
    let data: { display_name?: string; address?: Record<string, string> };
    try {
      const r = await fetch(url, {
        // HTTP headers allow plain ASCII only (the office name contains an em dash).
        headers: { 'User-Agent': `NagaCityLivestock/1.0 (${OFFICE_NAME.replace(/[^\x20-\x7E]/g, '-')})` },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = (await r.json()) as typeof data;
    } catch {
      throw new HttpError(502, 'Address lookup is unavailable right now. Type the address manually.');
    }
    const a = data.address ?? {};
    const barangay = matchBarangay(
      a.quarter,
      a.neighbourhood,
      a.suburb,
      a.village,
      a.hamlet,
      a.city_district,
    );
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const parts = [
      street,
      a.neighbourhood ?? a.hamlet,
      barangay ?? a.quarter ?? a.suburb ?? a.village,
      a.city ?? a.town ?? a.municipality,
    ].filter((p): p is string => !!p);
    const address = [...new Set(parts)].join(', ') || data.display_name || '';
    const result = { address, barangay };
    if (geoCache.size > 500) geoCache.clear();
    geoCache.set(key, result);
    return result;
  });
  geoQueue = run.catch(() => undefined);
  return run;
}

metricsRouter.get(
  '/geocode/reverse',
  ah(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw badRequest('Invalid coordinates');
    }
    res.json(await reverseGeocode(lat, lng));
  }),
);

metricsRouter.get(
  '/monthly-summary',
  ah(async (req, res) => {
    const month = qstr(req.query.month);
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw badRequest('Use a month like 2026-11');
    res.json(await monthlySummary(month, qstr(req.query.barangay)));
  }),
);

metricsRouter.get(
  '/dashboard',
  ah(async (req, res) => {
    res.json(
      await overview({
        barangay: qstr(req.query.barangay),
        species: qstr(req.query.species),
        caseStatus: qstr(req.query.caseStatus),
      }),
    );
  }),
);

metricsRouter.get(
  '/analytics',
  ah(async (req, res) => {
    const months = Math.min(24, Math.max(3, Number(req.query.months) || 6));
    res.json(
      await overview({ barangay: qstr(req.query.barangay), species: qstr(req.query.species), months }),
    );
  }),
);

metricsRouter.get('/reports', (_req, res) => {
  res.json(REPORT_TYPES);
});

metricsRouter.get(
  '/reports/outbreak-area',
  ah(async (req, res) => {
    const caseId = Number(req.query.caseId);
    if (!caseId) throw badRequest('Select a case');
    res.json(await buildOutbreakReport(caseId, Number(req.query.radius) || undefined));
  }),
);

metricsRouter.get(
  '/reports/:type',
  ah(async (req, res) => {
    res.json(
      await buildReport(req.params.type, {
        barangay: qstr(req.query.barangay),
        species: qstr(req.query.species),
        from: qstr(req.query.from),
        to: qstr(req.query.to),
      }),
    );
  }),
);

/* ---------------- search, notifications, lookups ---------------- */

/**
 * Search everything: owners, farms, tagged animals, disease cases, strays, laboratory samples and
 * submissions. The top bar asks for a few of each; the Search page asks for more, and can narrow
 * by type, barangay and species.
 */
metricsRouter.get(
  '/search',
  ah(async (req, res) => {
    const q = (qstr(req.query.q) ?? '').trim();
    const type = qstr(req.query.type);
    const barangay = qstr(req.query.barangay);
    const species = qstr(req.query.species);
    const take = Math.min(100, Math.max(1, Number(req.query.limit) || 5));
    // With a barangay or species chosen, an empty search lists everything that matches them.
    if (q.length < 2 && !barangay && !species) return res.json([]);
    const like = q.length >= 2 ? { contains: q } : undefined;
    const want = (t: string) => !type || type === t;
    const or = <T>(xs: T[]) => (like ? { OR: xs } : {});
    const [owners, farms, animals, cases, strays, samples, submissions] = await Promise.all([
      want('owner') && !species
        ? prisma.owner.findMany({
            where: {
              status: { not: 'ARCHIVED' },
              ...(barangay ? { barangay } : {}),
              ...or([{ fullName: like }, { code: like }, { contact: like }, { rsbsa: like }]),
            },
            orderBy: { fullName: 'asc' },
            take,
          })
        : [],
      want('farm')
        ? prisma.farm.findMany({
            where: {
              archived: false,
              ...(barangay ? { barangay } : {}),
              ...(species ? { groups: { some: { species, archived: false } } } : {}),
              ...or([{ name: like }, { code: like }, { barangay: like }, { owner: { fullName: like } }]),
            },
            include: { owner: { select: { fullName: true } } },
            orderBy: { name: 'asc' },
            take,
          })
        : [],
      want('animal')
        ? prisma.animal.findMany({
            where: {
              ...(species ? { species } : {}),
              ...(barangay ? { group: { farm: { barangay } } } : {}),
              ...or([
                { code: like },
                { earTag: like },
                { colcNo: like },
                { group: { farm: { owner: { fullName: like } } } },
              ]),
            },
            include: { group: { include: { farm: { include: { owner: true } } } } },
            take,
          })
        : [],
      want('case')
        ? prisma.diseaseCase.findMany({
            where: {
              voidedAt: null,
              ...(barangay ? { barangay } : {}),
              ...(species ? { species } : {}),
              ...or([{ code: like }, { disease: like }, { barangay: like }, { owner: { fullName: like } }]),
            },
            include: { farm: true, _count: { select: { investigations: { where: { voidedAt: null } } } } },
            orderBy: { reportedAt: 'desc' },
            take,
          })
        : [],
      want('stray')
        ? prisma.strayIncident.findMany({
            where: {
              ...(barangay ? { barangay } : {}),
              ...(species ? { species } : {}),
              ...or([{ code: like }, { earTag: like }, { owner: { fullName: like } }, { location: like }]),
            },
            include: { owner: true },
            orderBy: { discoveredAt: 'desc' },
            take,
          })
        : [],
      want('sample')
        ? prisma.labRecord.findMany({
            where: {
              voidedAt: null,
              ...(barangay ? { farm: { barangay } } : {}),
              ...(species ? { species } : {}),
              ...or([{ sampleId: like }, { labReference: like }, { farm: { owner: { fullName: like } } }]),
            },
            include: { farm: { include: { owner: true } }, case: true, submission: true },
            orderBy: { id: 'desc' },
            take,
          })
        : [],
      want('submission') && !barangay && !species && like
        ? prisma.labSubmission.findMany({
            where: {
              OR: [{ code: like }, { accessionNo: like }, { requestId: like }, { examination: like }],
            },
            orderBy: { id: 'desc' },
            take,
          })
        : [],
    ]);
    res.json([
      ...owners.map((o) => ({
        type: 'Owner',
        label: o.fullName,
        sub: `${o.code} · ${o.barangay}${o.rsbsa ? ` · RSBSA ${o.rsbsa}` : ''}`,
        barangay: o.barangay,
        href: `/owners/${o.id}`,
      })),
      ...farms.map((f) => ({
        type: 'Farm',
        label: f.name,
        sub: `${f.code} · ${f.barangay} · ${f.owner.fullName}`,
        barangay: f.barangay,
        href: `/farms/${f.id}`,
      })),
      ...animals.map((a) => ({
        type: 'Animal',
        label: a.earTag ? `${a.earTag} · ${a.code}` : a.code,
        sub: `${a.species} · ${a.group.farm.owner.fullName} · ${a.group.farm.barangay}${a.status !== 'ACTIVE' ? ` · ${a.status.toLowerCase()}` : ''}`,
        barangay: a.group.farm.barangay,
        species: a.species,
        href: `/animals/${a.id}`,
      })),
      ...cases.map((c) => ({
        type: 'Case',
        label: `${c.code} · ${c.disease}`,
        sub: `${c.farm.name} · ${c.barangay} · ${CASE_CLASS_LABELS[caseClass({ status: c.status, closed: c.closedAt != null, visited: c._count.investigations > 0 })]}`,
        barangay: c.barangay,
        species: c.species,
        href: `/cases/${c.id}`,
      })),
      ...strays.map((x) => ({
        type: 'Stray',
        label: `${x.code} · ${x.species}`,
        sub: `${x.barangay} · ${x.owner?.fullName ?? 'Unknown owner'} · ${x.status === 'CLOSED' ? 'Closed' : 'Reported'}`,
        barangay: x.barangay,
        species: x.species,
        href: `/strays?open=${x.id}`,
      })),
      ...samples.map((l) => ({
        type: 'Sample',
        label: `${l.sampleId} · ${titleCase(l.result)}`,
        sub: `${l.farm?.owner.fullName ?? '—'} · ${l.farm?.barangay ?? '—'} · ${l.case ? l.case.code : (l.submission?.code ?? '')}`,
        barangay: l.farm?.barangay,
        species: l.species,
        href: l.case ? `/cases/${l.caseId}?tab=laboratory` : `/lab-submissions/${l.submissionId}`,
      })),
      ...submissions.map((b) => ({
        type: 'Lab batch',
        label: `${b.code} · ${b.examination}`,
        sub: `${b.accessionNo ? `Accession ${b.accessionNo} · ` : ''}${fmtDate(ymd(b.submittedAt))}`,
        href: `/lab-submissions/${b.id}`,
      })),
    ]);
  }),
);

metricsRouter.get(
  '/notifications',
  ah(async (_req, res) => {
    const settings = await getSettings();
    const farms = (await loadFarms()).map(summarizeFarm);
    // Closed cases no longer need attention.
    const cases = (await loadCases()).filter((c) => c.closedAt == null);
    const start = today();
    const end = new Date(`${start}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + settings.vaccinationUpcomingDays);
    const due = await prisma.vaccination.findMany({
      where: {
        voidedAt: null,
        reminderDone: false,
        ...liveReminder,
        nextDate: { lte: end, gte: new Date(new Date(`${start}T00:00:00Z`).getTime() - 30 * 86400_000) },
      },
      include: { farm: true, group: true, animal: true },
      orderBy: { nextDate: 'asc' },
    });
    // Follow-up visits that are due (the latest visit on an open case asked for another one).
    const visits = await prisma.investigation.findMany({
      where: { voidedAt: null, case: { closedAt: null } },
      include: { case: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    const latestVisit = new Map<number, (typeof visits)[number]>();
    for (const v of visits) if (!latestVisit.has(v.caseId)) latestVisit.set(v.caseId, v);
    const followUps = [...latestVisit.values()].filter((v) => v.nextVisit && v.nextVisit <= end);
    // Planned or ongoing response measures that should have started or are due to end.
    const measures = await prisma.responseActivity.findMany({
      where: {
        voidedAt: null,
        case: { closedAt: null },
        OR: [
          { status: 'PLANNED', date: { lte: end } },
          { status: 'ONGOING', endDate: { lte: end } },
        ],
      },
      include: { case: true },
      orderBy: { date: 'asc' },
    });
    const items = [
      ...followUps.map((v) => {
        const nd = ymd(v.nextVisit)!;
        return {
          kind: 'case',
          title: `${v.case.code}: follow-up visit ${nd < start ? 'overdue' : 'due'} ${fmtDate(nd)}`,
          sub: `${v.case.disease} · ${v.case.barangay}`,
          href: `/cases/${v.caseId}`,
        };
      }),
      ...measures.map((m) => ({
        kind: 'case',
        title:
          m.status === 'PLANNED'
            ? `${m.case.code}: ${RESPONSE_TYPE_LABELS[m.type as ResponseType] ?? m.type} planned ${fmtDate(ymd(m.date))}`
            : `${m.case.code}: ${RESPONSE_TYPE_LABELS[m.type as ResponseType] ?? m.type} ends ${fmtDate(ymd(m.endDate))}`,
        sub: `${m.case.disease} · ${m.case.barangay} — update its status`,
        href: `/cases/${m.caseId}`,
      })),
      ...cases
        .filter((c) => c.lat == null)
        .map((c) => ({
          kind: 'geotag',
          title: `${c.code} needs a location`,
          sub: `${c.disease} · ${c.barangay}`,
          href: `/cases/${c.id}`,
        })),
      ...cases
        .filter((c) => c.status === 'SUSPECTED')
        .map((c) => ({
          kind: 'case',
          title: `${c.code} suspected ${c.disease}`,
          sub: `${c.farm.name} · reported ${fmtDate(ymd(c.reportedAt))}`,
          href: `/cases/${c.id}`,
        })),
      ...due.map((v) => {
        const nd = ymd(v.nextDate)!;
        return {
          kind: 'vaccination',
          title: `${v.vaccine ?? SERVICE_TYPE_LABELS[v.serviceType as ServiceType] ?? 'Service'} ${nd < start ? 'overdue' : 'due'} ${fmtDate(nd)}`,
          sub: `${v.farm.name} · ${v.target === 'GROUP' ? `${v.group?.code} · ${v.count} head` : v.animal?.code}`,
          href: '/services?tab=upcoming',
        };
      }),
      ...farms
        .filter((f) => f.recordStatus === 'overdue' || f.recordStatus === 'outdated')
        .map((f) => ({
          kind: 'population',
          title: `${f.name}: population ${f.recordStatus === 'overdue' ? 'update overdue' : 'record outdated'}`,
          sub: `${f.code} · ${f.barangay}`,
          href: `/population?farm=${f.id}`,
        })),
    ];
    res.json({ count: items.length, items });
  }),
);

metricsRouter.get(
  '/lookups',
  ah(async (_req, res) => {
    const [owners, farms, groups, animals, inspectors] = await Promise.all([
      prisma.owner.findMany({ where: { status: { not: 'ARCHIVED' } }, orderBy: { fullName: 'asc' } }),
      prisma.farm.findMany({ where: { archived: false }, orderBy: { id: 'asc' } }),
      prisma.populationGroup.findMany({
        where: { archived: false, farm: { archived: false } },
        include: { farm: true, animals: { where: { status: 'ACTIVE' }, select: { id: true } } },
        orderBy: { id: 'asc' },
      }),
      prisma.animal.findMany({
        where: { status: 'ACTIVE' },
        include: { group: true },
        orderBy: { id: 'asc' },
      }),
      prisma.user.findMany({
        where: { active: true, role: { in: ['ADMIN', 'STAFF'] } },
        orderBy: { name: 'asc' },
      }),
    ]);
    res.json({
      owners: owners.map((o) => ({
        id: o.id,
        code: o.code,
        fullName: o.fullName,
        barangay: o.barangay,
        zone: o.zone,
      })),
      farms: farms.map((f) => ({
        id: f.id,
        code: f.code,
        name: f.name,
        ownerId: f.ownerId,
        barangay: f.barangay,
        zone: f.zone,
        type: f.type,
        lat: f.lat,
        lng: f.lng,
      })),
      groups: groups.map((g) => ({
        id: g.id,
        code: g.code,
        farmId: g.farmId,
        farmName: g.farm.name,
        species: g.species,
        breed: g.breed,
        sex: g.sex,
        lifeStage: g.lifeStage,
        count: g.count,
        tagged: g.animals.length,
      })),
      animals: animals.map((a) => ({
        id: a.id,
        code: a.code,
        earTag: a.earTag,
        species: a.species,
        farmId: a.group.farmId,
      })),
      inspectors: inspectors.map((u) => ({ id: u.id, name: u.name })),
    });
  }),
);

/* ---------------- settings ---------------- */

export const settingsRouter = Router();
settingsRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(await getSettings());
  }),
);
settingsRouter.put(
  '/',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const d = parse(settingsSchema, req.body);
    await saveSettings(d);
    await logActivity('settings', 0, 'updated', 'System settings updated', req.user?.name);
    res.json(await getSettings());
  }),
);

/** Admin: download every record as one JSON file (passwords and login tokens are left out). */
settingsRouter.get(
  '/backup',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, title: true, role: true, active: true, createdAt: true },
    });
    const data = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.name ?? null,
      users,
      owners: await prisma.owner.findMany(),
      pcicPolicies: await prisma.pcicPolicy.findMany(),
      farms: await prisma.farm.findMany(),
      populationGroups: await prisma.populationGroup.findMany(),
      populationUpdates: await prisma.populationUpdate.findMany(),
      animals: await prisma.animal.findMany(),
      ownershipTransfers: await prisma.ownershipTransfer.findMany(),
      strayIncidents: await prisma.strayIncident.findMany(),
      diseaseCases: await prisma.diseaseCase.findMany(),
      caseStatusHistory: await prisma.caseStatusHistory.findMany(),
      investigations: await prisma.investigation.findMany(),
      labRecords: await prisma.labRecord.findMany(),
      responseActivities: await prisma.responseActivity.findMany(),
      vaccinations: await prisma.vaccination.findMany(),
      activityLog: await prisma.activityLog.findMany(),
      settings: await prisma.setting.findMany(),
    };
    await logActivity('settings', 0, 'backup', 'Data backup downloaded', req.user?.name);
    // Decimal values (PCIC amounts) serialise as strings.
    const json = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="naga-livestock-backup-${today()}.json"`);
    res.send(json);
  }),
);

/* ---------------- uploads ---------------- */

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Only JPG, PNG, WEBP, GIF images or PDF files are allowed'));
  },
});

export const uploadsRouter = Router();
uploadsRouter.post(
  '/',
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded');
    const ext =
      path
        .extname(req.file.originalname)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '') || '';
    const folder =
      typeof req.body.folder === 'string' && /^[a-z-]+$/.test(req.body.folder) ? req.body.folder : 'misc';
    const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}${ext}`;
    await storage.put(key, req.file.buffer, req.file.mimetype);
    res.status(201).json({ key, url: `/api/files/${key}` });
  }),
);

export const filesRouter = Router();
filesRouter.get(
  /^\/(.+)$/,
  ah(async (req, res) => {
    const key = (req.params as any)[0] as string;
    if (key.includes('..')) throw badRequest('Invalid key');
    const f = await storage.get(key);
    if (!f) throw new HttpError(404, 'File not found');
    if (f.contentType) res.setHeader('Content-Type', f.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    f.body.pipe(res);
  }),
);
