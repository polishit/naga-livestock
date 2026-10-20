import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isoMonth } from '@livestock/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/db';

const app = createApp();
let admin: request.Agent;
let viewer: request.Agent;

async function agentFor(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: 'Livestock@2026' });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  admin = await agentFor('admin@nagacityvet.gov.ph');
  viewer = await agentFor('viewer@nagacityvet.gov.ph');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health & auth', () => {
  it('reports database health', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('sets httpOnly cookies on login and rotates refresh tokens', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mark@nagacityvet.gov.ph', password: 'Livestock@2026' });
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', refresh);
    expect(r1.status).toBe(200);
    // The old refresh token is single-use.
    const r2 = await request(app).post('/api/auth/refresh').set('Cookie', refresh);
    expect(r2.status).toBe(401);
  });

  it('rejects bad credentials and anonymous access', async () => {
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'admin@nagacityvet.gov.ph', password: 'nope' })
      ).status,
    ).toBe(401);
    expect((await request(app).get('/api/owners')).status).toBe(401);
  });

  it('enforces role-based access', async () => {
    expect((await viewer.get('/api/owners')).status).toBe(200);
    expect((await viewer.post('/api/owners').send({ fullName: 'X', barangay: 'Pacol' })).status).toBe(403);
    expect((await viewer.get('/api/users')).status).toBe(403);
  });
});

describe('dashboard metrics match the prototype seed', () => {
  it('computes headline figures', async () => {
    const { body } = await admin.get('/api/dashboard');
    expect(body.stats).toMatchObject({
      owners: 20,
      farms: 28,
      outdatedFarms: 1,
      livestock: 3473,
      verifiedPct: 59,
      suspected: 4,
      inLab: 3,
      positive: 1,
      awaitingGeotag: 1,
    });
  });

  it('finds the farms within 1 km of CASE-0001', async () => {
    const { body } = await admin.get('/api/radius?caseId=1&radius=1000');
    expect(body.totals).toMatchObject({ farms: 6, livestock: 988, owners: 6 });
    expect(body.farms.map((f: { distance: number }) => f.distance)).toEqual([0, 210, 380, 560, 730, 910]);
    expect(body.excluded).toBe(1);
  });

  it('generates every report type', async () => {
    const { body: types } = await admin.get('/api/reports');
    expect(types).toHaveLength(27);
    for (const t of types.filter((x: { id: string }) => x.id !== 'outbreak-area')) {
      const res = await admin.get(`/api/reports/${t.id}`);
      expect(res.status, t.id).toBe(200);
      expect(Array.isArray(res.body.rows)).toBe(true);
    }
    const ob = await admin.get('/api/reports/outbreak-area?caseId=1&radius=1000');
    expect(ob.body.rows).toHaveLength(6);
  });
});

describe('registry writes', () => {
  it('validates and creates owners with sequential codes', async () => {
    const bad = await admin.post('/api/owners').send({ fullName: '', barangay: 'Nowhere' });
    expect(bad.status).toBe(400);
    expect(bad.body.fieldErrors).toHaveProperty('fullName');
    expect(bad.body.fieldErrors).toHaveProperty('barangay');
    const ok = await admin
      .post('/api/owners')
      .send({ fullName: 'Test Owner', barangay: 'Tinago', contact: '' });
    expect(ok.status).toBe(201);
    expect(ok.body.code).toMatch(/^OWN-\d{4}$/);
    expect(ok.body.contact).toBeNull();
  });

  it('supersedes a re-saved monthly population update', async () => {
    const month = isoMonth();
    const first = await admin
      .post('/api/population/updates')
      .send({ farmId: 2, month, entries: [{ groupId: 3, count: 45 }] });
    expect(first.status).toBe(201);
    await admin
      .post('/api/population/updates')
      .send({ farmId: 2, month, entries: [{ groupId: 3, count: 44 }] });
    const rows = await prisma.populationUpdate.findMany({ where: { groupId: 3, month } });
    expect(rows.filter((r) => !r.superseded)).toHaveLength(1);
    expect(rows.filter((r) => r.superseded).length).toBeGreaterThanOrEqual(1);
    const g = await prisma.populationGroup.findUnique({ where: { id: 3 } });
    expect(g).toMatchObject({ count: 44, lastVerified: month });
  });

  it('will not drop a group below its tagged animals', async () => {
    const res = await admin
      .post('/api/population/updates')
      .send({ farmId: 9, month: isoMonth(), entries: [{ groupId: 20, count: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tagged/);
  });

  it('moves one head between groups on transfer', async () => {
    const before = await prisma.populationGroup.findMany({ where: { id: { in: [14, 22] } } });
    const res = await admin.post('/api/transfers').send({ animalId: 4, toFarmId: 10, date: '2026-10-15' });
    expect(res.status).toBe(201);
    const after = await prisma.populationGroup.findMany({ where: { id: { in: [14, 22] } } });
    const get = (arr: typeof before, id: number) => arr.find((g) => g.id === id)!.count;
    expect(get(after, 14)).toBe(get(before, 14) - 1);
    expect(get(after, 22)).toBe(get(before, 22) + 1);
    const a = await prisma.animal.findUnique({ where: { id: 4 } });
    expect(a!.groupId).toBe(22);
  });

  it('blocks archiving farms that still hold animals', async () => {
    const res = await admin.post('/api/farms/1/archive');
    expect(res.status).toBe(400);
  });
});

describe('disease surveillance', () => {
  it('uses farm coordinates when a case has no pin, and records history', async () => {
    const res = await admin
      .post('/api/cases')
      .send({ ownerId: 1, farmId: 1, species: 'Swine', disease: 'ASF', affected: 3, deaths: 0 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      lat: 13.638,
      lng: 123.238,
      locationSource: 'Farm Coordinates',
      status: 'SUSPECTED',
    });
    const s = await admin.post(`/api/cases/${res.body.id}/status`).send({ status: 'SAMPLE_COLLECTED' });
    expect(s.status).toBe(200);
    const { body } = await admin.get(`/api/cases/${res.body.id}`);
    expect(body.history.map((h: { status: string }) => h.status)).toEqual(['SAMPLE_COLLECTED', 'SUSPECTED']);
  });

  it('rejects a farm that does not belong to the owner', async () => {
    const res = await admin
      .post('/api/cases')
      .send({ ownerId: 2, farmId: 1, species: 'Swine', disease: 'ASF', affected: 1, deaths: 0 });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.farmId).toBeDefined();
  });

  it('validates vaccination counts against the group size', async () => {
    const res = await admin
      .post('/api/vaccinations')
      .send({ farmId: 13, target: 'GROUP', groupId: 29, count: 500, vaccine: 'PPR', doseNumber: 1 });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.count[0]).toMatch(/only has/);
  });
});
