import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
      suspected: 5,
      inLab: 4,
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
    expect(types).toHaveLength(36);
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

describe('reverse geocoding (map click → address)', () => {
  const nominatim = (address: Record<string, string>) =>
    new Response(JSON.stringify({ display_name: 'x', address }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  it('builds an address and matches the barangay, ignoring accents', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(nominatim({ road: 'Pacol Road', quarter: 'Pacol', city: 'Naga' }))
      .mockResolvedValueOnce(nominatim({ suburb: 'Concepcion Pequena', city: 'Naga' }));
    const a = await admin.get('/api/geocode/reverse?lat=13.655&lng=123.224');
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ address: 'Pacol Road, Pacol, Naga', barangay: 'Pacol' });
    const b = await viewer.get('/api/geocode/reverse?lat=13.62&lng=123.21');
    expect(b.body.barangay).toBe('Concepcion Pequeña');
    expect(String(spy.mock.calls[0][0])).toContain('/reverse?format=jsonv2');
    // Header values must be plain ASCII or fetch() refuses to send the request.
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^[\x20-\x7E]+$/);
    expect(() => new Headers(headers)).not.toThrow();
    spy.mockRestore();
  });

  it('reports when the lookup service is unavailable, and validates input', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await admin.get('/api/geocode/reverse?lat=13.7&lng=123.3');
    expect(r.status).toBe(502);
    spy.mockRestore();
    expect((await admin.get('/api/geocode/reverse?lat=abc&lng=1')).status).toBe(400);
  });
});

describe('logic fixes: population stays correct', () => {
  it('a tagged animal leaving lowers its group, coming back raises it, with history lines', async () => {
    const g0 = await prisma.populationGroup.findUnique({ where: { id: 20 } });
    const r = await admin.patch('/api/animals/1').send({ sex: 'Female', status: 'DECEASED' });
    expect(r.status).toBe(200);
    const g1 = await prisma.populationGroup.findUnique({ where: { id: 20 } });
    expect(g1!.count).toBe(g0!.count - 1);
    expect(g1!.lastVerified).toBe(g0!.lastVerified); // an adjustment is not a verification
    const adj = await prisma.populationUpdate.findFirst({
      where: { groupId: 20, kind: 'ADJUSTMENT' },
      orderBy: { id: 'desc' },
    });
    expect(adj).toMatchObject({ change: -1, previous: g0!.count });
    expect(adj!.reason).toMatch(/NC-C-0001 marked deceased/);
    await admin.patch('/api/animals/1').send({ sex: 'Female', status: 'ACTIVE' });
    expect((await prisma.populationGroup.findUnique({ where: { id: 20 } }))!.count).toBe(g0!.count);
  });

  it('transfers write a history line on both groups', async () => {
    await admin.post('/api/transfers').send({ animalId: 3, toFarmId: 10, date: '2026-10-16' });
    const lines = await prisma.populationUpdate.findMany({
      where: { kind: 'ADJUSTMENT', reason: { contains: 'NC-K-0003' } },
    });
    expect(lines.map((l) => l.change).sort()).toEqual([-1, 1]);
  });

  it('correcting an older month recalculates the next month', async () => {
    const r = await admin
      .post('/api/population/updates')
      .send({ farmId: 1, month: '2026-08', entries: [{ groupId: 1, count: 30 }] });
    expect(r.status).toBe(201);
    const sep = await prisma.populationUpdate.findFirst({
      where: { groupId: 1, month: '2026-09', superseded: false },
      orderBy: { id: 'desc' },
    });
    expect(sep).toMatchObject({ previous: 30, change: sep!.count - 30 });
    // An older month never changes the current count.
    expect((await prisma.populationGroup.findUnique({ where: { id: 1 } }))!.count).toBe(40);
  });

  it('groups can be edited, and archived only when empty', async () => {
    const e = await admin
      .patch('/api/population/groups/2')
      .send({ breed: 'Native', sex: 'Mixed', lifeStage: 'Mixed', healthStatus: 'Healthy' });
    expect(e.status).toBe(200);
    expect(e.body.breed).toBe('Native');
    expect((await admin.post('/api/population/groups/2/archive')).status).toBe(400);
  });
});

describe('logic fixes: disease cases', () => {
  it('checks species, head count and dates when reporting', async () => {
    const base = { ownerId: 1, farmId: 1, disease: 'Test', deaths: 0 };
    const noSpecies = await admin.post('/api/cases').send({ ...base, species: 'Goat', affected: 1 });
    expect(noSpecies.body.fieldErrors.species[0]).toMatch(/has no Goat/);
    const tooMany = await admin.post('/api/cases').send({ ...base, species: 'Swine', affected: 999 });
    expect(tooMany.body.fieldErrors.affected[0]).toMatch(/only 40 Swine/);
    const dates = await admin.post('/api/cases').send({
      ...base,
      species: 'Swine',
      affected: 1,
      reportedAt: '2026-10-01',
      symptomsDate: '2026-10-05',
    });
    expect(dates.body.fieldErrors.symptomsDate).toBeDefined();
    const future = await admin
      .post('/api/cases')
      .send({ ...base, species: 'Swine', affected: 1, reportedAt: '2099-01-01' });
    expect(future.body.fieldErrors.reportedAt[0]).toMatch(/future/);
  });

  it('enforces the status workflow and ties final results to the lab', async () => {
    // CASE-0006 is Suspected with no lab record.
    const skip = await admin.post('/api/cases/6/status').send({ status: 'SENT_TO_LAB' });
    expect(skip.body.fieldErrors.status[0]).toMatch(/one stage at a time/);
    const pos = await admin.post('/api/cases/6/status').send({ status: 'POSITIVE' });
    expect(pos.body.fieldErrors.status[0]).toMatch(/positive laboratory result/);
    // CASE-0003 is Awaiting result with a pending lab record (id 3): record the result, then confirm.
    const lab = await admin.patch('/api/labs/3').send({
      sampleId: 'RADDL-0003',
      collectedAt: '2026-09-08',
      sentAt: '2026-09-08',
      result: 'NEGATIVE',
      resultDate: '2026-09-15',
    });
    expect(lab.status).toBe(200);
    expect((await admin.post('/api/cases/3/status').send({ status: 'POSITIVE' })).status).toBe(400);
    expect((await admin.post('/api/cases/3/status').send({ status: 'NEGATIVE' })).status).toBe(200);
    // Going back is an admin correction that needs a reason.
    const mark = await agentFor('mark@nagacityvet.gov.ph');
    expect((await mark.post('/api/cases/3/status').send({ status: 'AWAITING_RESULT' })).status).toBe(400);
    const noReason = await admin.post('/api/cases/3/status').send({ status: 'AWAITING_RESULT' });
    expect(noReason.body.fieldErrors.note).toBeDefined();
    const ok = await admin
      .post('/api/cases/3/status')
      .send({ status: 'AWAITING_RESULT', note: 'Result was entered on the wrong case' });
    expect(ok.status).toBe(200);
  });

  it('lab dates must be in order', async () => {
    const r = await admin
      .post('/api/cases/6/labs')
      .send({ sampleId: 'X-1', collectedAt: '2026-10-10', sentAt: '2026-10-05' });
    expect(r.body.fieldErrors.sentAt).toBeDefined();
  });

  it('edits case details with a history line and tracks deaths for the population', async () => {
    const r = await admin
      .patch('/api/cases/1')
      .send({ disease: 'African Swine Fever (ASF)', affected: 12, deaths: 4 });
    expect(r.status).toBe(200);
    const { body } = await admin.get('/api/cases/1');
    expect(body.history[0].note).toMatch(/deaths: 1 → 4/);
    expect(body.case.pendingPopulation).toBe(3); // 4 deaths, 1 already counted in the seed
    await admin.post('/api/cases/1/responses').send({ type: 'CULLING_DEPOPULATION', heads: 5 });
    expect((await admin.get('/api/cases/1')).body.case.pendingPopulation).toBe(8);
    await admin.post('/api/cases/1/population-reconciled');
    expect((await admin.get('/api/cases/1')).body.case.pendingPopulation).toBe(0);
    const noHeads = await admin.post('/api/cases/1/responses').send({ type: 'CULLING_DEPOPULATION' });
    expect(noHeads.body.fieldErrors.heads).toBeDefined();
  });

  it('a farm pin can be applied to its unmapped cases; closed cases leave notifications', async () => {
    // CASE-0009 (farm 15) has no location in the seed.
    const geo = await admin.patch('/api/farms/15/location').send({ lat: 13.66, lng: 123.25 });
    expect(geo.body.unmappedCases).toBe(1);
    expect((await admin.post('/api/farms/15/locate-cases')).body.updated).toBe(1);
    const c = await prisma.diseaseCase.findUnique({ where: { id: 9 } });
    expect(c).toMatchObject({ lat: 13.66, locationSource: 'Farm Coordinates' });
    const before = (await admin.get('/api/notifications')).body.items.filter(
      (i: { href: string }) => i.href === '/cases/2',
    );
    expect(before).toHaveLength(0);
  });

  it('cannot archive a farm with an open case', async () => {
    const res = await admin.post('/api/farms/26/archive');
    expect(res.body.error).toMatch(/open disease case/);
  });
});

describe('logic fixes: vaccination, registry and corrections', () => {
  it('a later dose clears the earlier reminder; dead animals and future dates are refused', async () => {
    const first = await admin.post('/api/vaccinations').send({
      farmId: 13,
      target: 'GROUP',
      groupId: 29,
      count: 10,
      vaccine: 'PPR',
      doseNumber: 1,
      date: '2026-10-01',
      nextDate: '2026-10-20',
    });
    expect(first.status).toBe(201);
    const second = await admin.post('/api/vaccinations').send({
      farmId: 13,
      target: 'GROUP',
      groupId: 29,
      count: 10,
      vaccine: 'ppr',
      doseNumber: 2,
      date: '2026-10-21',
    });
    expect(second.status).toBe(201);
    expect((await prisma.vaccination.findUnique({ where: { id: first.body.id } }))!.reminderDone).toBe(true);
    const future = await admin.post('/api/vaccinations').send({
      farmId: 13,
      target: 'GROUP',
      groupId: 29,
      count: 1,
      vaccine: 'PPR',
      doseNumber: 1,
      date: '2099-01-01',
    });
    expect(future.body.fieldErrors.date).toBeDefined();
    await admin.patch('/api/animals/2').send({ sex: 'Female', status: 'SOLD' });
    const dead = await admin.post('/api/vaccinations').send({
      farmId: 9,
      target: 'ANIMAL',
      animalId: 2,
      count: 1,
      vaccine: 'HS',
      doseNumber: 1,
    });
    expect(dead.body.fieldErrors.animalId[0]).toMatch(/sold/);
  });

  it('coverage never counts more than a group holds', async () => {
    for (let i = 0; i < 2; i++)
      await admin.post('/api/vaccinations').send({
        farmId: 13,
        target: 'GROUP',
        groupId: 30,
        count: 7,
        vaccine: 'Sheep pox',
        doseNumber: 1,
      });
    const cov = await admin.get('/api/vaccinations/coverage?species=Sheep');
    const sheep = cov.body.rows.find((r: { species: string }) => r.species === 'Sheep');
    expect(sheep.estimatedHeads).toBeLessThanOrEqual(7);
  });

  it('reassigning a farm records ownership transfers for its tagged animals', async () => {
    const before = await prisma.ownershipTransfer.count();
    const r = await admin.post('/api/farms/9/reassign').send({ ownerId: 4 });
    expect(r.status).toBe(200);
    expect(r.body.transferredAnimals).toBeGreaterThan(0);
    expect(await prisma.ownershipTransfer.count()).toBe(before + r.body.transferredAnimals);
  });

  it('admins can void a record with a reason; it leaves the figures', async () => {
    const v = await admin.post('/api/vaccinations').send({
      farmId: 13,
      target: 'GROUP',
      groupId: 29,
      count: 5,
      vaccine: 'Wrong entry',
      doseNumber: 1,
    });
    expect((await viewer.post(`/api/vaccinations/${v.body.id}/void`).send({ reason: 'x' })).status).toBe(403);
    const mark = await agentFor('mark@nagacityvet.gov.ph');
    expect((await mark.post(`/api/vaccinations/${v.body.id}/void`).send({ reason: 'typo' })).status).toBe(
      403,
    );
    expect((await admin.post(`/api/vaccinations/${v.body.id}/void`).send({ reason: '' })).status).toBe(400);
    const ok = await admin
      .post(`/api/vaccinations/${v.body.id}/void`)
      .send({ reason: 'Entered on the wrong farm' });
    expect(ok.status).toBe(200);
    const list = await admin.get('/api/vaccinations');
    expect(list.body.find((x: { id: number }) => x.id === v.body.id)).toMatchObject({
      voided: true,
      voidReason: 'Entered on the wrong farm',
    });
  });

  it('warns about duplicate owners and blocks a repeated RSBSA number', async () => {
    const dup = await admin.post('/api/owners').send({ fullName: 'juan dela cruz', barangay: 'Cararayan' });
    expect(dup.status).toBe(409);
    expect(dup.body.fieldErrors.fullName[0]).toMatch(/Possible duplicate/);
    const ok = await admin.post('/api/owners').send({
      fullName: 'Juan Dela Cruz',
      barangay: 'Cararayan',
      confirmDuplicate: true,
      rsbsa: 'RS-TEST-1',
    });
    expect(ok.status).toBe(201);
    const rs = await admin
      .post('/api/owners')
      .send({ fullName: 'Someone Else', barangay: 'Pacol', rsbsa: 'RS-TEST-1' });
    expect(rs.body.fieldErrors.rsbsa[0]).toMatch(/already used/);
  });

  it('only admins can download a backup, and it has no passwords', async () => {
    expect((await viewer.get('/api/settings/backup')).status).toBe(403);
    const b = await admin.get('/api/settings/backup');
    expect(b.status).toBe(200);
    expect(b.text).not.toContain('passwordHash');
    expect(JSON.parse(b.text).farms.length).toBeGreaterThan(0);
  });
});

describe('richer records, date rules and record keeping', () => {
  it('rejects impossible and out-of-order dates everywhere', async () => {
    const before2000 = await admin
      .post('/api/cases/6/investigations')
      .send({ date: '0202-05-01', notes: 'Typo year' });
    expect(before2000.body.fieldErrors.date[0]).toMatch(/2000/);
    const notReal = await admin.post('/api/cases/6/investigations').send({ date: '2026-02-30', notes: 'x' });
    expect(notReal.body.fieldErrors.date[0]).toMatch(/valid date/);
    // CASE-0006 was reported on 2026-09-20: follow-up records cannot be earlier.
    const early = await admin.post('/api/cases/6/investigations').send({ date: '2026-09-01', notes: 'x' });
    expect(early.body.fieldErrors.date[0]).toMatch(/before the case began/);
    const pcic = await admin.post('/api/owners/1/pcic').send({
      policyNo: 'P-1',
      species: 'Swine',
      heads: 2,
      startDate: '2026-06-01',
      endDate: '2026-01-01',
    });
    expect(pcic.body.fieldErrors.endDate).toBeDefined();
    const phone = await admin
      .post('/api/owners')
      .send({ fullName: 'Pedro Penduko', barangay: 'Pacol', contact: 'call me' });
    expect(phone.body.fieldErrors.contact).toBeDefined();
    const name = await admin.post('/api/owners').send({ fullName: '12345', barangay: 'Pacol' });
    expect(name.body.fieldErrors.fullName).toBeDefined();
    const nextDose = await admin.post('/api/vaccinations').send({
      farmId: 13,
      target: 'GROUP',
      groupId: 29,
      count: 1,
      vaccine: 'PPR',
      doseNumber: 1,
      date: '2026-10-01',
      nextDate: '2026-09-01',
    });
    expect(nextDose.body.fieldErrors.nextDate).toBeDefined();
  });

  it('stores structured investigation findings and reminds about the next visit', async () => {
    const inv = await admin.post('/api/cases/6/investigations').send({
      date: '2026-09-21',
      visitType: 'INITIAL',
      animalsExamined: 10,
      sickCount: 4,
      deadCount: 1,
      clinicalSigns: 'Fever, skin lesions',
      biosecurity: 'No footbath',
      actionsTaken: 'Isolated sick pigs',
      samplesCollected: true,
      nextVisit: '2026-09-28',
      notes: 'Suspected ASF; owner advised.',
    });
    expect(inv.status).toBe(201);
    const bad = await admin
      .post('/api/cases/6/investigations')
      .send({ animalsExamined: 2, sickCount: 5, notes: 'x' });
    expect(bad.body.fieldErrors.sickCount).toBeDefined();
    const { body } = await admin.get('/api/cases/6');
    expect(body.investigations[0]).toMatchObject({
      visitType: 'INITIAL',
      visitLabel: 'Initial visit',
      sickCount: 4,
      samplesCollected: true,
      nextVisit: '2026-09-28',
    });
    expect(body.history[0].note).toMatch(/Initial visit recorded/);
    const notes = (await admin.get('/api/notifications')).body.items;
    expect(notes.some((n: { title: string }) => /follow-up visit overdue/.test(n.title))).toBe(true);
  });

  it('lab edits are written to the case history and cannot undo a final result', async () => {
    const add = await admin.post('/api/cases/6/labs').send({
      sampleId: 'RADDL-T1',
      sampleType: 'Whole blood',
      sampleCount: 3,
      testMethod: 'PCR',
      collectedAt: '2026-09-21',
    });
    expect(add.status).toBe(201);
    const upd = await admin.patch(`/api/labs/${add.body.id}`).send({
      sampleId: 'RADDL-T1',
      sampleType: 'Whole blood',
      sampleCount: 3,
      testMethod: 'PCR',
      collectedAt: '2026-09-21',
      sentAt: '2026-09-22',
      labReference: 'R5-2026-118',
    });
    expect(upd.status).toBe(200);
    const { body } = await admin.get('/api/cases/6');
    expect(body.history[0].note).toMatch(/Lab record RADDL-T1 updated — .*sent — → /);
    expect(body.labs.find((l: { id: number }) => l.id === add.body.id)).toMatchObject({
      testMethod: 'PCR',
      labReference: 'R5-2026-118',
      updatedBy: expect.any(String),
    });
    // CASE-0001 is Positive; its positive result cannot be changed or voided while the status stands.
    const posLab =
      body &&
      (await admin.get('/api/cases/1')).body.labs.find((l: { result: string }) => l.result === 'POSITIVE');
    const change = await admin.patch(`/api/labs/${posLab.id}`).send({ ...posLab, result: 'NEGATIVE' });
    expect(change.body.error).toMatch(/correct the case status first/);
    const voidIt = await admin.post(`/api/labs/${posLab.id}/void`).send({ reason: 'Wrong case' });
    expect(voidIt.body.error).toMatch(/correct the case status first/);
  });

  it('planned responses may be future-dated, get completed, and must be done before closing', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const fd = future.toISOString().slice(0, 10);
    const notPlanned = await admin.post('/api/cases/1/responses').send({ type: 'QUARANTINE', date: fd });
    expect(notPlanned.body.fieldErrors.date[0]).toMatch(/planned/);
    const planned = await admin
      .post('/api/cases/1/responses')
      .send({ type: 'QUARANTINE', status: 'PLANNED', date: fd, endDate: fd, location: 'Farm 1' });
    expect(planned.status).toBe(201);
    const close = await admin
      .post('/api/cases/1/close')
      .send({ outcome: 'CONTAINED', note: 'Quarantine done' });
    expect(close.body.error).toMatch(/still planned or ongoing/);
    const done = await admin.patch(`/api/responses/${planned.body.id}`).send({
      type: 'QUARANTINE',
      status: 'COMPLETED',
      date: '2026-10-01',
      endDate: '2026-10-15',
      location: 'Farm 1',
    });
    expect(done.status).toBe(200);
    const tooMany = await admin
      .post('/api/cases/1/responses')
      .send({ type: 'CULLING_DEPOPULATION', heads: 100000 });
    expect(tooMany.body.fieldErrors.heads[0]).toMatch(/on record/);
    const noOutcome = await admin.post('/api/cases/1/close').send({ note: 'Done' });
    expect(noOutcome.body.fieldErrors.outcome).toBeDefined();
    const ok = await admin
      .post('/api/cases/1/close')
      .send({ outcome: 'CONTAINED', note: 'No new cases in 30 days' });
    expect(ok.status).toBe(200);
    expect(ok.body.closureOutcome).toBe('CONTAINED');
    // Closed: follow-up records are locked, including voiding, until an administrator reopens the case.
    const labId = (await admin.get('/api/cases/1')).body.labs[0].id;
    expect((await admin.post(`/api/labs/${labId}/void`).send({ reason: 'x' })).body.error).toMatch(/closed/);
    expect(
      (await admin.patch(`/api/responses/${planned.body.id}`).send({ type: 'QUARANTINE' })).body.error,
    ).toMatch(/closed/);
    await admin.post('/api/cases/1/reopen');
    expect((await prisma.diseaseCase.findUnique({ where: { id: 1 } }))!.closureOutcome).toBeNull();
  });

  it('lookups show how many animals are tagged in each group', async () => {
    const { body } = await admin.get('/api/lookups');
    expect(body.groups[0]).toHaveProperty('tagged');
  });
});

describe('logic audit: corrections, reminders and record integrity', () => {
  it('re-saving an older month keeps later automatic adjustments', async () => {
    // GRP-0021 (farm 10, cattle) was last verified last month with 14 head; NC-C-0008 is in it.
    const g0 = await prisma.populationGroup.findUnique({ where: { id: 21 } });
    const lastMonth = g0!.lastVerified!;
    expect(lastMonth < isoMonth()).toBe(true);
    await admin.patch('/api/animals/8').send({ status: 'SOLD' });
    expect((await prisma.populationGroup.findUnique({ where: { id: 21 } }))!.count).toBe(g0!.count - 1);
    const fix = await admin.post('/api/population/updates').send({
      farmId: 10,
      month: lastMonth,
      entries: [{ groupId: 21, count: g0!.count, reason: 'recount' }],
    });
    expect(fix.status).toBe(201);
    // The sale this month still counts: the corrected month does not bring the sold animal back.
    expect((await prisma.populationGroup.findUnique({ where: { id: 21 } }))!.count).toBe(g0!.count - 1);
  });

  it('a partial animal update does not wipe the fields it did not send', async () => {
    const before = await prisma.animal.findUnique({ where: { id: 7 } });
    const r = await admin.patch('/api/animals/7').send({ health: 'Under observation' });
    expect(r.status).toBe(200);
    const after = await prisma.animal.findUnique({ where: { id: 7 } });
    expect(after).toMatchObject({
      earTag: before!.earTag,
      breed: before!.breed,
      health: 'Under observation',
    });
    // Sending a field blank still clears it.
    await admin.patch('/api/animals/7').send({ markings: '' });
    expect((await prisma.animal.findUnique({ where: { id: 7 } }))!.markings).toBeNull();
  });

  it('cannot report a month before the group was first recorded', async () => {
    const g = await admin
      .post('/api/population/groups')
      .send({ farmId: 13, species: 'Duck', count: 5, reportingMonth: isoMonth() });
    expect(g.status).toBe(201);
    const early = await admin
      .post('/api/population/updates')
      .send({ farmId: 13, month: '2026-01', entries: [{ groupId: g.body.id, count: 5 }] });
    expect(early.status).toBe(400);
    expect(early.body.error).toMatch(/first recorded/);
  });

  it('editing a case still works after its deaths left the population', async () => {
    const c = await admin.post('/api/cases').send({
      ownerId: 3,
      farmId: 3,
      species: 'Chicken',
      disease: 'Newcastle Disease',
      affected: 100,
      deaths: 10,
    });
    expect(c.status).toBe(201);
    await admin
      .post('/api/population/updates')
      .send({ farmId: 3, month: isoMonth(), entries: [{ groupId: 6, count: 90, reason: 'deaths −10' }] });
    await admin.post(`/api/cases/${c.body.id}/population-reconciled`);
    const edit = await admin
      .patch(`/api/cases/${c.body.id}`)
      .send({ disease: 'Newcastle Disease', affected: 100, deaths: 10, remarks: 'Owner informed' });
    expect(edit.status).toBe(200);
    // Raising the count beyond what the farm ever had is still refused.
    const tooMany = await admin
      .patch(`/api/cases/${c.body.id}`)
      .send({ disease: 'Newcastle Disease', affected: 150, deaths: 10 });
    expect(tooMany.body.fieldErrors.affected).toBeDefined();
  });

  it('a case cannot be closed while its deaths are not reflected in the population', async () => {
    // CASE-0002 is Negative; one more death leaves the farm population out of date.
    await admin.patch('/api/cases/2').send({ disease: 'Hog Cholera', affected: 12, deaths: 2 });
    const close = await admin.post('/api/cases/2/close').send({ outcome: 'NOT_CONFIRMED', note: 'Negative' });
    expect(close.status).toBe(400);
    expect(close.body.error).toMatch(/population/);
  });

  it('voiding a dose brings back the reminder it had cleared; a back-dated dose is not reminded', async () => {
    const base = { farmId: 13, target: 'GROUP', groupId: 30, count: 1 };
    const a = await admin
      .post('/api/vaccinations')
      .send({ ...base, vaccine: 'Audit Vax', doseNumber: 1, date: '2026-10-01', nextDate: '2026-10-20' });
    const b = await admin
      .post('/api/vaccinations')
      .send({ ...base, vaccine: 'audit vax', doseNumber: 2, date: '2026-10-10' });
    expect((await prisma.vaccination.findUnique({ where: { id: a.body.id } }))!.reminderDone).toBe(true);
    await admin.post(`/api/vaccinations/${b.body.id}/void`).send({ reason: 'Entered twice' });
    expect((await prisma.vaccination.findUnique({ where: { id: a.body.id } }))!.reminderDone).toBe(false);
    // Dose 2 recorded first, then the older dose 1 typed in later: no reminder for a dose already given.
    await admin
      .post('/api/vaccinations')
      .send({ ...base, vaccine: 'Backfill Vax', doseNumber: 2, date: '2026-10-15' });
    const old = await admin
      .post('/api/vaccinations')
      .send({ ...base, vaccine: 'Backfill Vax', doseNumber: 1, date: '2026-09-01', nextDate: '2026-10-01' });
    expect((await prisma.vaccination.findUnique({ where: { id: old.body.id } }))!.reminderDone).toBe(true);
  });

  it('reminders for animals that left are not shown', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const v = await admin.post('/api/vaccinations').send({
      farmId: 10,
      target: 'ANIMAL',
      animalId: 9,
      count: 1,
      vaccine: 'HS Audit',
      doseNumber: 1,
      nextDate: soon.toISOString().slice(0, 10),
    });
    expect(v.status).toBe(201);
    const listed = async () =>
      (await admin.get('/api/vaccinations/upcoming')).body.rows.some(
        (r: { id: number }) => r.id === v.body.id,
      );
    expect(await listed()).toBe(true);
    await admin.patch('/api/animals/9').send({ status: 'DECEASED' });
    expect(await listed()).toBe(false);
    const notes = (await admin.get('/api/notifications')).body.items;
    expect(notes.some((n: { title: string }) => n.title.startsWith('HS Audit'))).toBe(false);
  });

  it('stray owner can be cleared and must match a registered ear tag', async () => {
    const s = await admin
      .post('/api/strays')
      .send({ species: 'Goat', ownerId: 1, barangay: 'Pacol', location: 'Road side' });
    expect(s.status).toBe(201);
    const clear = await admin
      .patch(`/api/strays/${s.body.id}`)
      .send({ status: 'REPORTED', violations: '0', ownerId: '', remarks: '' });
    expect(clear.status).toBe(200);
    expect((await prisma.strayIncident.findUnique({ where: { id: s.body.id } }))!.ownerId).toBeNull();
    // ET-2407 is NC-C-0007, a cattle of owner 7.
    const wrong = await admin
      .post('/api/strays')
      .send({ species: 'Goat', earTag: 'ET-2407', ownerId: 1, barangay: 'Pacol', location: 'Road side' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.fieldErrors.ownerId ?? wrong.body.fieldErrors.species).toBeDefined();
    const ok = await admin
      .post('/api/strays')
      .send({ species: 'Cattle', earTag: 'et-2407', barangay: 'Pacol', location: 'Road side' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ ownerId: 7, animalId: 7 });
  });

  it('a lab sample ID is used only once', async () => {
    const dup = await admin
      .post('/api/cases/5/labs')
      .send({ sampleId: 'RADDL-T1', collectedAt: '2026-10-01' });
    expect(dup.status).toBe(400);
    expect(dup.body.fieldErrors.sampleId[0]).toMatch(/already used/);
  });

  it('PCIC policies: one number per policy, expiry shown, status can be updated', async () => {
    const p = await admin.post('/api/owners/2/pcic').send({
      policyNo: 'PCIC-AUDIT-1',
      species: 'Swine',
      heads: 3,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
    expect(p.status).toBe(201);
    const again = await admin.post('/api/owners/5/pcic').send({
      policyNo: 'pcic-audit-1',
      species: 'Swine',
      heads: 3,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(again.body.fieldErrors.policyNo[0]).toMatch(/already recorded/);
    const owner = (await admin.get('/api/owners/2')).body;
    expect(owner.pcic.find((x: { id: number }) => x.id === p.body.id).status).toBe('EXPIRED');
    const claim = await admin.patch(`/api/owners/pcic/${p.body.id}`).send({
      policyNo: 'PCIC-AUDIT-1',
      species: 'Swine',
      heads: 3,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      status: 'CLAIMED',
      remarks: 'Claim paid',
    });
    expect(claim.status).toBe(200);
    expect(
      (await admin.get('/api/owners/2')).body.pcic.find((x: { id: number }) => x.id === p.body.id),
    ).toMatchObject({ status: 'CLAIMED', remarks: 'Claim paid' });
  });

  it("an animal's record shows its new herd's doses only from when it arrived", async () => {
    // NC-K-0003 moved into GRP-0022 (farm 10, carabao) on 2026-10-16 in an earlier test.
    const dose = (vaccine: string, date: string) =>
      admin
        .post('/api/vaccinations')
        .send({ farmId: 10, target: 'GROUP', groupId: 22, count: 1, vaccine, doseNumber: 1, date });
    expect((await dose('Herd Dose Before', '2026-10-01')).status).toBe(201);
    expect((await dose('Herd Dose After', '2026-10-20')).status).toBe(201);
    const names = (await admin.get('/api/animals/3')).body.vaccinations.map(
      (v: { vaccine: string }) => v.vaccine,
    );
    expect(names).toContain('Herd Dose After');
    expect(names).not.toContain('Herd Dose Before');
  });

  it('report headers do not invent a start date', async () => {
    const r = await admin.get('/api/reports/owner-registry');
    expect(r.body.subtitle).not.toMatch(/2026-05-01/);
  });

  it('changing a user role signs them out of other sessions', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'mark@nagacityvet.gov.ph', password: 'Livestock@2026' });
    const cookies = login.headers['set-cookie'] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];
    const mark = await prisma.user.findUnique({ where: { email: 'mark@nagacityvet.gov.ph' } });
    await admin.patch(`/api/users/${mark!.id}`).send({ role: 'READONLY' });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', refresh)).status).toBe(401);
    await admin.patch(`/api/users/${mark!.id}`).send({ role: 'STAFF' });
  });
});

describe('usability additions', () => {
  it('moves a tagged animal to another group on the same farm', async () => {
    // NC-C-0007 is in GRP-0021 (farm 10, cattle).
    const g = await admin
      .post('/api/population/groups')
      .send({ farmId: 10, species: 'Cattle', lifeStage: 'adult', count: 5 });
    expect(g.status).toBe(201);
    const src0 = (await prisma.populationGroup.findUnique({ where: { id: 21 } }))!.count;
    const wrongSpecies = await admin.post('/api/animals/7/move').send({ groupId: 22 });
    expect(wrongSpecies.body.fieldErrors.groupId[0]).toMatch(/Cattle group/);
    const otherFarm = await admin.post('/api/animals/7/move').send({ groupId: 20 });
    expect(otherFarm.body.fieldErrors.groupId[0]).toMatch(/same farm/);
    const ok = await admin.post('/api/animals/7/move').send({ groupId: g.body.id, reason: 'Now adult' });
    expect(ok.status).toBe(200);
    expect((await prisma.animal.findUnique({ where: { id: 7 } }))!.groupId).toBe(g.body.id);
    expect((await prisma.populationGroup.findUnique({ where: { id: 21 } }))!.count).toBe(src0 - 1);
    expect((await prisma.populationGroup.findUnique({ where: { id: g.body.id } }))!.count).toBe(6);
    const { body } = await admin.get('/api/animals/7');
    expect(body.history[0].summary).toMatch(/Moved from GRP-0021 to GRP-\d+ — Now adult/);
  });

  it("summarises an owner's earlier stray incidents", async () => {
    const before = (await admin.get('/api/strays/owner/7/summary')).body;
    const s = await admin
      .post('/api/strays')
      .send({ species: 'Cattle', earTag: 'ET-2408', barangay: 'Pacol', location: 'Market road' });
    expect(s.status).toBe(201);
    await admin.patch(`/api/strays/${s.body.id}`).send({ violations: '2' });
    const after = (await admin.get('/api/strays/owner/7/summary')).body;
    expect(after.incidents).toBe(before.incidents + 1);
    expect(after.violations).toBe(before.violations + 2);
    expect(after.last.code).toBe(s.body.code);
    const excluding = (await admin.get(`/api/strays/owner/7/summary?except=${s.body.id}`)).body;
    expect(excluding.incidents).toBe(before.incidents);
  });
});

describe('survey follow-up: strays, ASF steps, pasture, records and insurance', () => {
  const today = new Date().toISOString().slice(0, 10);

  /** A new owner with one farm, and tagged animals per species (independent of earlier tests). */
  async function freshHerd(name: string, species: Record<string, number>) {
    const o = await admin
      .post('/api/owners')
      .send({ fullName: name, barangay: 'Carolina', contact: '0917-555-0101' });
    const f = await admin.post('/api/farms').send({
      ownerId: o.body.id,
      name: `${name} Farm`,
      type: 'backyard',
      barangay: 'Carolina',
      lat: 13.664,
      lng: 123.272,
    });
    const animals: Record<string, number[]> = {};
    for (const [sp, n] of Object.entries(species)) {
      const g = await admin.post('/api/population/groups').send({ farmId: f.body.id, species: sp, count: n });
      animals[sp] = [];
      for (let i = 0; i < n; i++) {
        const a = await admin.post('/api/animals').send({
          groupId: g.body.id,
          sex: 'Female',
          earTag: `${name.slice(0, 3).toUpperCase()}-${sp.toUpperCase()}-${i}`,
        });
        expect(a.status).toBe(201);
        animals[sp].push(a.body.id);
      }
    }
    return { ownerId: o.body.id as number, farmId: f.body.id as number, animals };
  }

  it('records impoundment, release and a paid fine with their rules', async () => {
    const s = await admin
      .post('/api/strays')
      .send({ species: 'Goat', barangay: 'Pacol', location: 'Highway shoulder', ownerId: 5 });
    expect(s.status).toBe(201);
    const url = `/api/strays/${s.body.id}`;
    const noPlace = await admin.patch(url).send({ status: 'IMPOUNDED' });
    expect(noPlace.status).toBe(400);
    expect(Object.keys(noPlace.body.fieldErrors).sort()).toEqual(['impoundPlace', 'impoundedAt']);
    const imp = await admin.patch(url).send({
      status: 'IMPOUNDED',
      impoundedAt: today,
      impoundPlace: 'City pound',
      violationType: 'Animal on a public road or highway',
      fineAmount: '500',
    });
    expect(imp.status).toBe(200);
    expect(imp.body).toMatchObject({ impoundPlace: 'City pound', fineAmount: 500, finePaid: false });
    // Sending only the remarks keeps everything else.
    await admin.patch(url).send({ remarks: 'Owner informed by phone' });
    const kept = (await admin.get(url)).body;
    expect(kept).toMatchObject({ status: 'IMPOUNDED', impoundedAt: today, fineAmount: 500 });
    const early = await admin
      .patch(url)
      .send({ status: 'RELEASED', releasedAt: '2020-01-01', releasedTo: 'Owner' });
    expect(early.body.fieldErrors.releasedAt[0]).toMatch(/before the impound date/);
    const noOr = await admin.patch(url).send({ finePaid: true });
    expect(noOr.body.fieldErrors.orNumber[0]).toMatch(/official receipt/);
    const summary = (await admin.get('/api/strays/owner/5/summary')).body;
    expect(summary.unpaidFines).toBeGreaterThanOrEqual(1);
    const done = await admin.patch(url).send({
      status: 'RELEASED',
      releasedAt: today,
      releasedTo: 'Owner (Juan)',
      finePaid: true,
      orNumber: 'OR-778812',
      paidAt: today,
    });
    expect(done.status).toBe(200);
    const backwards = await admin.patch(url).send({ status: 'IMPOUNDED' });
    expect(backwards.body.fieldErrors.status[0]).toMatch(/Released/);
    const report = (await admin.get('/api/reports/stray-incidents')).body;
    const row = report.rows.find((r: { code: string }) => r.code === s.body.code);
    expect(row.fine).toMatch(/Paid, OR OR-778812/);
    expect(row.impound).toMatch(/City pound/);
  });

  it("keeps a tagged stray's owner consistent with the registered tag", async () => {
    const herd = await freshHerd('Stray Tag Owner', { Cattle: 1 });
    const tag = (await prisma.animal.findUnique({ where: { id: herd.animals.Cattle[0] } }))!.earTag;
    const s = await admin
      .post('/api/strays')
      .send({ species: 'Cattle', earTag: tag, barangay: 'Pacol', location: 'Riverside' });
    expect(s.body.ownerId).toBe(herd.ownerId);
    const other = herd.ownerId === 7 ? 8 : 7;
    const wrong = await admin.patch(`/api/strays/${s.body.id}`).send({ ownerId: String(other) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.fieldErrors.ownerId[0]).toMatch(/owned by Stray Tag Owner/);
  });

  it('offers barangay coordination and lists the ASF steps in order', async () => {
    const r = await admin
      .post('/api/cases/1/responses')
      .send({ type: 'BARANGAY_COORDINATION', status: 'COMPLETED', date: today, personnel: 'Brgy. Captain' });
    expect(r.status).toBe(201);
    const { body } = await admin.get('/api/cases/1');
    expect(body.responses.some((x: { typeLabel: string }) => x.typeLabel === 'Barangay Coordination')).toBe(
      true,
    );
    const shared = await import('@livestock/shared');
    expect(shared.RESPONSE_TYPE_LABELS.ASF_CHECKPOINT).toBe('ASF Checkpoint');
    expect(shared.RESPONSE_TYPE_LABELS.DISINFECTION).toBe('Disinfection / Decontamination');
    expect(shared.isAsfDisease('African Swine Fever (ASF)')).toBe(true);
    expect(shared.isAsfDisease('Hog Cholera')).toBe(false);
  });

  it('keeps unsent farm fields on a partial update and counts pastures in the outbreak radius', async () => {
    const before = (await prisma.farm.findUnique({ where: { id: 28 } }))!;
    const renamed = await admin.patch('/api/farms/28').send({ name: `${before.name} ` });
    expect(renamed.status).toBe(200);
    const after = (await prisma.farm.findUnique({ where: { id: 28 } }))!;
    expect(after.lat).toBe(before.lat);
    expect(after.address).toBe(before.address);
    const half = await admin.patch('/api/farms/28').send({ pastureLat: 13.6385 });
    expect(half.body.fieldErrors.pastureLng).toBeDefined();
    const outside = (await admin.get('/api/radius?caseId=1&radius=1000')).body;
    expect(outside.farms.some((f: { id: number }) => f.id === 28)).toBe(false);
    const p = await admin.patch('/api/farms/28').send({
      pastureLocation: 'Communal pasture near the river',
      pastureLat: 13.6385,
      pastureLng: 123.2385,
    });
    expect(p.status).toBe(200);
    const inside = (await admin.get('/api/radius?caseId=1&radius=1000')).body;
    const f = inside.farms.find((x: { id: number }) => x.id === 28);
    expect(f.role).toBe('Nearby farm (pasture)');
    expect((await admin.get('/api/farms/28')).body.farm.pastureLocation).toMatch(/Communal/);
  });

  it('links PCIC policies to insured ear tags', async () => {
    const herd = await freshHerd('Insured Owner', { Cattle: 2, Carabao: 1 });
    const [c1, c2] = herd.animals.Cattle;
    const [k1] = herd.animals.Carabao;
    const strangers = await prisma.animal.findFirst({
      where: { species: 'Cattle', status: 'ACTIVE', NOT: { group: { farm: { ownerId: herd.ownerId } } } },
    });
    const url = `/api/owners/${herd.ownerId}/pcic`;
    const base = {
      policyNo: 'PCIC-LS-2026-9001',
      species: 'Cattle',
      heads: 1,
      startDate: today,
      endDate: `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`,
      status: 'ACTIVE',
    };
    const tooMany = await admin.post(url).send({ ...base, animalIds: [c1, c2] });
    expect(tooMany.body.fieldErrors.animalIds[0]).toMatch(/More animals/);
    const wrong = await admin.post(url).send({ ...base, heads: 3, animalIds: [c1, k1, strangers!.id] });
    expect(wrong.body.fieldErrors.animalIds[0]).toMatch(/is a Carabao, not Cattle/);
    expect(wrong.body.fieldErrors.animalIds[0]).toMatch(
      new RegExp(`${strangers!.code}.* is not an active animal of this owner`),
    );
    const ok = await admin.post(url).send({ ...base, animalIds: [c1] });
    expect(ok.status).toBe(201);
    const twice = await admin.post(url).send({ ...base, policyNo: 'PCIC-LS-2026-9002', animalIds: [c1] });
    expect(twice.body.fieldErrors.animalIds[0]).toMatch(/already insured under PCIC-LS-2026-9001/);
    const tag = (await prisma.animal.findUnique({ where: { id: c1 } }))!.earTag;
    const owner = (await admin.get(`/api/owners/${herd.ownerId}`)).body;
    expect(owner.pcic[0].animals.map((a: { earTag: string }) => a.earTag)).toEqual([tag]);
    expect((await admin.get(`/api/animals/${c1}`)).body.insurance[0].policyNo).toBe(base.policyNo);
    // Updating without the list keeps the animals; an empty list removes them.
    await admin.patch(`/api/owners/pcic/${ok.body.id}`).send({ ...base, remarks: 'Renewed' });
    expect((await admin.get(`/api/animals/${c1}`)).body.insurance).toHaveLength(1);
    const report = (await admin.get('/api/reports/pcic-policies')).body;
    expect(report.rows.find((r: { policy: string }) => r.policy === base.policyNo).animals).toBe(tag);
    await admin.patch(`/api/owners/pcic/${ok.body.id}`).send({ ...base, animalIds: [] });
    expect((await admin.get(`/api/animals/${c1}`)).body.insurance).toHaveLength(0);
  });

  it('reports RSBSA registration and incomplete records', async () => {
    const owners = await prisma.owner.findMany({ where: { status: { not: 'ARCHIVED' } } });
    const rs = (await admin.get('/api/reports/rsbsa-registration')).body;
    const total = rs.rows.reduce((a: number, r: { owners: number }) => a + r.owners, 0);
    expect(total).toBe(owners.length);
    expect(rs.summary.find((x: { label: string }) => x.label === 'With RSBSA No.').value).toBe(
      owners.filter((o) => o.rsbsa).length,
    );
    const o = await admin
      .post('/api/owners')
      .send({ fullName: 'Incomplete Test Owner', barangay: 'Carolina' });
    expect(o.status).toBe(201);
    const inc = (await admin.get('/api/reports/incomplete-records')).body;
    const row = inc.rows.find((r: { code: string }) => r.code === o.body.code);
    expect(row).toMatchObject({ type: 'Owner', missing: 'contact number, RSBSA number' });
    expect(inc.rows.some((r: { type: string }) => r.type === 'Animal')).toBe(true);
  });

  it('keeps missed vaccination doses on the schedule as overdue', async () => {
    const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    const herd = await freshHerd('Vaccine Owner', { Goat: 1 });
    const v = await admin.post('/api/vaccinations').send({
      farmId: herd.farmId,
      target: 'ANIMAL',
      animalId: herd.animals.Goat[0],
      vaccine: 'Overdue-test vaccine',
      date: day(-40),
      nextDate: day(-5),
      doseNumber: 1,
      count: 1,
    });
    expect(v.status).toBe(201);
    const up = (await admin.get('/api/vaccinations/upcoming')).body;
    const row = up.rows.find((r: { id: number }) => r.id === v.body.id);
    expect(row.overdue).toBe(true);
  });

  it('blocks moving animals out of a farm under quarantine until it is lifted', async () => {
    const sick = await freshHerd('Quarantine Owner', { Swine: 2 });
    const other = await freshHerd('Receiving Owner', { Swine: 1 });
    const c = await admin.post('/api/cases').send({
      ownerId: sick.ownerId,
      farmId: sick.farmId,
      species: 'Swine',
      disease: 'African Swine Fever (ASF)',
      affected: 1,
      deaths: 0,
      reportedAt: today,
    });
    expect(c.status).toBe(201);
    const q = await admin
      .post(`/api/cases/${c.body.id}/responses`)
      .send({ type: 'QUARANTINE', status: 'ONGOING', date: today });
    expect(q.status).toBe(201);
    const out = sick.animals.Swine[0];
    const blocked = await admin
      .post('/api/transfers')
      .send({ animalId: out, toFarmId: other.farmId, date: today });
    expect(blocked.status).toBe(400);
    expect(blocked.body.fieldErrors.date[0]).toMatch(new RegExp(`under quarantine for ${c.body.code}`));
    const into = await admin
      .post('/api/transfers')
      .send({ animalId: other.animals.Swine[0], toFarmId: sick.farmId, date: today });
    expect(into.body.fieldErrors.toFarmId[0]).toMatch(/under quarantine/);
    const lift = await admin
      .patch(`/api/responses/${q.body.id}`)
      .send({ type: 'QUARANTINE', status: 'COMPLETED', date: today, endDate: today });
    expect(lift.status).toBe(200);
    const ok = await admin
      .post('/api/transfers')
      .send({ animalId: out, toFarmId: other.farmId, date: today });
    expect(ok.status).toBe(201);
  });
});

describe('farm edits reach open cases; work lists across open cases', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  it('open cases follow the farm pin, barangay and owner; closed ones keep theirs', async () => {
    const o = await admin.post('/api/owners').send({ fullName: 'Sync Owner', barangay: 'Pacol' });
    const f = await admin.post('/api/farms').send({
      ownerId: o.body.id,
      name: 'Sync Farm',
      type: 'backyard',
      barangay: 'Pacol',
      lat: 13.66,
      lng: 123.27,
    });
    await admin.post('/api/population/groups').send({ farmId: f.body.id, species: 'Swine', count: 5 });
    const c = await admin.post('/api/cases').send({
      ownerId: o.body.id,
      farmId: f.body.id,
      species: 'Swine',
      disease: 'Hog cholera',
      affected: 1,
      deaths: 0,
      reportedAt: today,
    });
    expect(c.status).toBe(201);
    const before = await prisma.diseaseCase.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(before).toMatchObject({ lat: 13.66, lng: 123.27, locationSource: 'Farm Coordinates' });

    const moved = await admin
      .patch(`/api/farms/${f.body.id}`)
      .send({ barangay: 'Carolina', lat: 13.67, lng: 123.28 });
    expect(moved.status).toBe(200);
    let now = await prisma.diseaseCase.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(now).toMatchObject({ lat: 13.67, lng: 123.28, barangay: 'Carolina' });

    const o2 = await admin.post('/api/owners').send({ fullName: 'New Sync Owner', barangay: 'Carolina' });
    expect((await admin.post(`/api/farms/${f.body.id}/reassign`).send({ ownerId: o2.body.id })).status).toBe(
      200,
    );
    now = await prisma.diseaseCase.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(now.ownerId).toBe(o2.body.id);

    // A closed case is a record of where it happened: moving the farm again leaves it alone.
    await prisma.diseaseCase.update({ where: { id: c.body.id }, data: { closedAt: new Date() } });
    await admin.patch(`/api/farms/${f.body.id}/location`).send({ lat: 13.68, lng: 123.29 });
    now = await prisma.diseaseCase.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(now).toMatchObject({ lat: 13.67, lng: 123.28 });
  });

  it('lists samples awaiting results, visits due and measures in force', async () => {
    const o = await admin.post('/api/owners').send({ fullName: 'Worklist Owner', barangay: 'Pacol' });
    const f = await admin
      .post('/api/farms')
      .send({ ownerId: o.body.id, name: 'Worklist Farm', type: 'backyard', barangay: 'Pacol' });
    await admin.post('/api/population/groups').send({ farmId: f.body.id, species: 'Swine', count: 5 });
    const c = await admin.post('/api/cases').send({
      ownerId: o.body.id,
      farmId: f.body.id,
      species: 'Swine',
      disease: 'African Swine Fever (ASF)',
      affected: 1,
      deaths: 0,
      reportedAt: today,
    });
    const id = c.body.id as number;
    let w = (await viewer.get('/api/case-worklist')).body;
    // Not visited yet: the initial visit is due.
    expect(w.visits.find((v: { caseId: number }) => v.caseId === id)).toMatchObject({ kind: 'INITIAL' });

    await admin
      .post(`/api/cases/${id}/investigations`)
      .send({ date: today, notes: 'Seen', nextVisit: tomorrow });
    await admin.post(`/api/cases/${id}/labs`).send({
      sampleId: 'WL-1',
      sampleType: 'Whole blood',
      sampleCount: 1,
      collectedAt: today,
      sentAt: today,
    });
    await admin
      .post(`/api/cases/${id}/responses`)
      .send({ type: 'QUARANTINE', status: 'ONGOING', date: today });
    await admin
      .post(`/api/cases/${id}/responses`)
      .send({ type: 'DISINFECTION', status: 'PLANNED', date: tomorrow });
    w = (await viewer.get('/api/case-worklist')).body;
    expect(w.visits.find((v: { caseId: number }) => v.caseId === id)).toMatchObject({
      kind: 'FOLLOW_UP',
      due: tomorrow,
      overdue: false,
    });
    expect(w.labs.find((l: { caseId: number }) => l.caseId === id)).toMatchObject({
      sampleId: 'WL-1',
      waitingDays: 0,
    });
    const states = w.measures
      .filter((m: { caseId: number }) => m.caseId === id)
      .map((m: { type: string; state: string }) => `${m.type}:${m.state}`);
    expect(states.sort()).toEqual(['DISINFECTION:PLANNED', 'QUARANTINE:IN_FORCE']);
  });
});

describe('reports & analytics insights and the task list', () => {
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));

  it('builds an accomplishment report for a period', async () => {
    const r = await viewer.get(`/api/reports/accomplishment?from=${today.slice(0, 7)}-01&to=${today}`);
    expect(r.status).toBe(200);
    const sections = new Set(r.body.rows.map((x: { section: string }) => x.section));
    expect([...sections]).toEqual([
      'Livestock registry',
      'Disease surveillance',
      'Disease response',
      'Deworming & veterinary services',
      'Vaccination',
      'Stray livestock & violations',
    ]);
    expect(r.body.rows.find((x: { indicator: string }) => x.indicator === 'Fines collected').value).toMatch(
      /^₱/,
    );
  });

  it('compares this period with the one before', async () => {
    const before = (await viewer.get('/api/insights/compare?months=1')).body;
    expect(before.kpis.map((k: { key: string }) => k.key)).toContain('cases');
    const o = await admin.post('/api/owners').send({ fullName: 'Compare Owner', barangay: 'Pacol' });
    expect(o.status).toBe(201);
    const after = (await viewer.get('/api/insights/compare?months=1')).body;
    const owners = (b: { kpis: { key: string; current: number }[] }) =>
      b.kpis.find((k) => k.key === 'owners')!.current;
    expect(owners(after)).toBe(owners(before) + 1);
  });

  it('flags a barangay with a sudden rise in cases as a hotspot', async () => {
    const o = await admin.post('/api/owners').send({ fullName: 'Hotspot Owner', barangay: 'Tinago' });
    const f = await admin
      .post('/api/farms')
      .send({ ownerId: o.body.id, name: 'Hotspot Farm', type: 'backyard', barangay: 'Tinago' });
    await admin.post('/api/population/groups').send({ farmId: f.body.id, species: 'Chicken', count: 50 });
    for (let i = 0; i < 2; i++)
      await admin.post('/api/cases').send({
        ownerId: o.body.id,
        farmId: f.body.id,
        species: 'Chicken',
        disease: 'Newcastle Disease',
        affected: 3,
        deaths: 0,
        reportedAt: today,
      });
    const h = (await viewer.get('/api/insights/hotspots')).body;
    expect(h.rows.find((r: { barangay: string }) => r.barangay === 'Tinago')).toMatchObject({
      level: 'hotspot',
      recent: 2,
    });
  });

  it('scores data quality with links to fix each gap', async () => {
    const q = (await viewer.get('/api/insights/data-quality')).body;
    expect(q.score).toBeGreaterThan(0);
    expect(q.score).toBeLessThanOrEqual(100);
    const unmapped = q.items.find((i: { key: string }) => i.key === 'farm-location');
    expect(unmapped.href).toBe('/farms?location=unmapped');
    expect(unmapped.missing).toBeGreaterThan(0);
  });

  it('admins set yearly vaccination targets and see progress', async () => {
    const targets = [{ vaccine: 'PPR Vaccine', species: 'Goat', target: 100 }];
    expect((await viewer.put('/api/insights/vaccination-targets').send({ year, targets })).status).toBe(403);
    const dup = await admin
      .put('/api/insights/vaccination-targets')
      .send({ year, targets: [...targets, { vaccine: 'ppr vaccine', species: 'Goat', target: 5 }] });
    expect(dup.status).toBe(400);
    const saved = await admin.put('/api/insights/vaccination-targets').send({ year, targets });
    expect(saved.status).toBe(200);
    const g = (await viewer.get(`/api/insights/vaccination-targets?year=${year}`)).body;
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0]).toMatchObject({ vaccine: 'PPR Vaccine', species: 'Goat', target: 100 });
    expect(typeof g.rows[0].given).toBe('number');
    // Targets are not mixed into the system settings form.
    expect(Object.keys((await viewer.get('/api/settings')).body)).not.toContain(`vaccinationTargets:${year}`);
  });

  it('lists tasks with a link and an action for each', async () => {
    const t = (await viewer.get('/api/insights/tasks')).body;
    expect(t.count).toBe(t.tasks.length);
    const groups = new Set(t.tasks.map((x: { group: string }) => x.group));
    expect(groups.has('Field visits')).toBe(true);
    expect(groups.has('Lab results')).toBe(true);
    for (const x of t.tasks) {
      expect(x.href).toMatch(/^\//);
      expect(x.action.length).toBeGreaterThan(0);
    }
  });
});

describe('removing and correcting records', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('deletes an owner entered by mistake, but not one with records', async () => {
    const o = await admin.post('/api/owners').send({ fullName: 'Typo Owner', barangay: 'Pacol' });
    expect((await viewer.delete(`/api/owners/${o.body.id}`)).status).toBe(403);
    const blocked = await admin.delete('/api/owners/1');
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/cannot be deleted: has \d+ farm/);
    expect(blocked.body.error).toMatch(/Archive the owner instead/);
    expect((await admin.delete(`/api/owners/${o.body.id}`)).status).toBe(200);
    expect((await admin.get(`/api/owners/${o.body.id}`)).status).toBe(404);
  });

  it('deletes an empty farm and an animal with no history; refuses farms with records', async () => {
    const o = await admin.post('/api/owners').send({ fullName: 'Delete Test Owner', barangay: 'Pacol' });
    const f = await admin
      .post('/api/farms')
      .send({ ownerId: o.body.id, name: 'Empty Farm', type: 'backyard', barangay: 'Pacol' });
    expect((await admin.delete(`/api/farms/${f.body.id}`)).status).toBe(200);
    const busy = await admin.delete('/api/farms/1');
    expect(busy.body.error).toMatch(/Archive the farm instead/);

    const f2 = await admin
      .post('/api/farms')
      .send({ ownerId: o.body.id, name: 'Tag Farm', type: 'backyard', barangay: 'Pacol' });
    const g = await admin
      .post('/api/population/groups')
      .send({ farmId: f2.body.id, species: 'Cattle', count: 2 });
    const a = await admin.post('/api/animals').send({ groupId: g.body.id, sex: 'Female', earTag: 'DEL-1' });
    expect((await admin.delete(`/api/animals/${a.body.id}`)).status).toBe(200);
    const a2 = await admin.post('/api/animals').send({ groupId: g.body.id, sex: 'Female', earTag: 'DEL-2' });
    await admin.post('/api/vaccinations').send({
      farmId: f2.body.id,
      target: 'ANIMAL',
      animalId: a2.body.id,
      count: 1,
      vaccine: 'Hemosep',
      doseNumber: 1,
    });
    const kept = await admin.delete(`/api/animals/${a2.body.id}`);
    expect(kept.body.error).toMatch(/has 1 vaccination record.*Change its status instead/);
  });

  it('voids a duplicate case: it leaves the lists and figures; reopening undoes it', async () => {
    const before = (await admin.get('/api/dashboard')).body.stats;
    const c = await admin.post('/api/cases').send({
      ownerId: 1,
      farmId: 1,
      species: 'Swine',
      disease: 'Duplicate report',
      affected: 1,
      deaths: 0,
      reportedAt: today,
    });
    expect((await admin.get('/api/dashboard')).body.stats.suspected).toBe(before.suspected + 1);
    expect((await viewer.post(`/api/cases/${c.body.id}/void`).send({ reason: 'x' })).status).toBe(403);
    expect((await admin.post(`/api/cases/${c.body.id}/void`).send({ reason: '' })).status).toBe(400);
    expect(
      (await admin.post(`/api/cases/${c.body.id}/void`).send({ reason: 'Same as CASE-0001' })).status,
    ).toBe(200);
    expect((await admin.get('/api/dashboard')).body.stats.suspected).toBe(before.suspected);
    const all = (await admin.get('/api/cases?state=all')).body;
    expect(all.some((r: { id: number }) => r.id === c.body.id)).toBe(false);
    const voided = (await admin.get('/api/cases?state=voided')).body;
    expect(voided.find((r: { id: number }) => r.id === c.body.id)).toMatchObject({
      voided: true,
      closed: true,
    });
    // The case page still shows it, read-only.
    const d = (await admin.get(`/api/cases/${c.body.id}`)).body;
    expect(d.case).toMatchObject({ voided: true, voidReason: 'Same as CASE-0001' });
    expect((await admin.post(`/api/cases/${c.body.id}/reopen`)).status).toBe(200);
    expect((await admin.get(`/api/cases/${c.body.id}`)).body.case).toMatchObject({
      voided: false,
      closed: false,
    });
    await admin.post(`/api/cases/${c.body.id}/void`).send({ reason: 'Duplicate' });
  });

  it('deletes a fresh stray report; one acted on can only be voided', async () => {
    const mk = () =>
      admin.post('/api/strays').send({
        species: 'Goat',
        barangay: 'Pacol',
        location: 'Road',
        discoveredAt: `${today}T08:00`,
      });
    const s1 = await mk();
    expect((await admin.delete(`/api/strays/${s1.body.id}`)).status).toBe(200);
    const s2 = await mk();
    await admin
      .patch(`/api/strays/${s2.body.id}`)
      .send({ status: 'IMPOUNDED', impoundedAt: today, impoundPlace: 'City pound' });
    const refused = await admin.delete(`/api/strays/${s2.body.id}`);
    expect(refused.body.error).toMatch(/Void it instead/);
    expect((await admin.post(`/api/strays/${s2.body.id}/void`).send({ reason: 'Wrong animal' })).status).toBe(
      200,
    );
    const list = (await admin.get('/api/strays')).body;
    expect(list.some((r: { id: number }) => r.id === s2.body.id)).toBe(false);
    const voided = (await admin.get('/api/strays?status=VOIDED')).body;
    expect(voided.find((r: { id: number }) => r.id === s2.body.id)).toMatchObject({ voided: true });
    expect((await admin.patch(`/api/strays/${s2.body.id}`).send({ remarks: 'x' })).status).toBe(400);
  });

  it('restores an archived farm and group', async () => {
    const o = await admin.post('/api/owners').send({ fullName: 'Restore Owner', barangay: 'Pacol' });
    const f = await admin
      .post('/api/farms')
      .send({ ownerId: o.body.id, name: 'Restore Farm', type: 'backyard', barangay: 'Pacol' });
    const g = await admin
      .post('/api/population/groups')
      .send({ farmId: f.body.id, species: 'Goat', count: 0 });
    expect((await admin.post(`/api/population/groups/${g.body.id}/archive`)).status).toBe(200);
    expect((await admin.post(`/api/population/groups/${g.body.id}/restore`)).status).toBe(200);
    await admin.post(`/api/population/groups/${g.body.id}/archive`);
    expect((await admin.post(`/api/farms/${f.body.id}/archive`)).status).toBe(200);
    const archived = (await admin.get('/api/farms?archived=1')).body;
    expect(archived.some((r: { id: number }) => r.id === f.body.id)).toBe(true);
    // A group cannot come back while its farm is archived.
    expect((await admin.post(`/api/population/groups/${g.body.id}/restore`)).body.error).toMatch(
      /Restore the farm/,
    );
    expect((await admin.post(`/api/farms/${f.body.id}/restore`)).status).toBe(200);
    const d = (await admin.get(`/api/farms/${f.body.id}`)).body;
    expect(d.farm.archived).toBe(false);
    expect(d.archivedGroups.map((x: { id: number }) => x.id)).toContain(g.body.id);
  });

  it('edits a site visit and a vaccination, with the change in the history', async () => {
    const c = await admin.post('/api/cases').send({
      ownerId: 1,
      farmId: 1,
      species: 'Swine',
      disease: 'Edit test',
      affected: 1,
      deaths: 0,
      reportedAt: today,
    });
    const i = await admin
      .post(`/api/cases/${c.body.id}/investigations`)
      .send({ date: today, notes: 'Typo heer' });
    const e = await admin.patch(`/api/investigations/${i.body.id}`).send({ date: today, notes: 'Typo here' });
    expect(e.status).toBe(200);
    expect(e.body.notes).toBe('Typo here');
    const hist = (await admin.get(`/api/cases/${c.body.id}`)).body.history;
    expect(hist.some((h: { note: string | null }) => /edited/.test(h.note ?? ''))).toBe(true);

    const v = await admin
      .post('/api/vaccinations')
      .send({ farmId: 13, target: 'GROUP', groupId: 29, count: 3, vaccine: 'PPR Vacine', doseNumber: 1 });
    const too = await admin
      .patch(`/api/vaccinations/${v.body.id}`)
      .send({ count: 9999, vaccine: 'PPR Vaccine', date: today, doseNumber: 1 });
    expect(too.body.fieldErrors.count[0]).toMatch(/only has/);
    const fixed = await admin
      .patch(`/api/vaccinations/${v.body.id}`)
      .send({ count: 4, vaccine: 'PPR Vaccine', date: today, doseNumber: 1 });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ vaccine: 'PPR Vaccine', count: 4 });
  });
});

describe('CVO revisions: masterlist, deworming, farm visits, monthly report', () => {
  it('stores a classification breakdown that must add up to the head count', async () => {
    const bad = await admin.post('/api/population/groups').send({
      farmId: 13,
      species: 'Goat',
      count: 6,
      reportingMonth: isoMonth(),
      breakdown: { kid: 2, doe: 2 },
    });
    expect(bad.status).toBe(400);
    const ok = await admin.post('/api/population/groups').send({
      farmId: 13,
      species: 'Goat',
      count: 6,
      reportingMonth: isoMonth(),
      breakdown: { kid: 2, doe: 3, buck: 1 },
    });
    expect(ok.status).toBe(201);
    const farm = await admin.get('/api/farms/13');
    const g = farm.body.groups.find((x: { id: number }) => x.id === ok.body.id);
    expect(g.breakdown).toEqual({ kid: 2, doe: 3, buck: 1 });
  });

  it('records deworming without a product and requires a vaccine only for vaccinations', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const dw = await admin
      .post('/api/vaccinations')
      .send({ serviceType: 'DEWORMING', farmId: 13, target: 'GROUP', groupId: 29, count: 12, date: today });
    expect(dw.status).toBe(201);
    expect(dw.body).toMatchObject({ serviceType: 'DEWORMING', vaccine: null });
    expect(dw.body.code).toMatch(/^SRV-/);
    const vax = await admin
      .post('/api/vaccinations')
      .send({ serviceType: 'VACCINATION', farmId: 13, target: 'GROUP', groupId: 29, count: 3, date: today });
    expect(vax.status).toBe(400);
    expect(vax.body.fieldErrors.vaccine).toBeDefined();
    const list = await admin.get('/api/vaccinations?type=DEWORMING');
    expect(list.body.every((v: { serviceType: string }) => v.serviceType === 'DEWORMING')).toBe(true);
  });

  it('logs farm visits, shows them on the farm and marks monitored farms near a case', async () => {
    const v = await admin
      .post('/api/farm-visits')
      .send({
        farmId: 13,
        date: new Date().toISOString().slice(0, 10),
        purpose: 'CHECKUP',
        remarks: 'All healthy',
      });
    expect(v.status).toBe(201);
    expect(v.body).toMatchObject({ purposeLabel: 'Veterinary Check-up', findings: 'NO_SIGNS' });
    expect(v.body.code).toMatch(/^VIS-/);
    const farm = await admin.get('/api/farms/13');
    expect(farm.body.visits[0].id).toBe(v.body.id);
    const future = await admin
      .post('/api/farm-visits')
      .send({ farmId: 13, date: '2099-01-01', purpose: 'ROUTINE' });
    expect(future.status).toBe(400);
    expect((await viewer.delete(`/api/farm-visits/${v.body.id}`)).status).toBe(403);
    const edited = await admin.patch(`/api/farm-visits/${v.body.id}`).send({ findings: 'SICK_ANIMALS' });
    expect(edited.body.findingsLabel).toBe('Sick animals found');

    const area = await admin.get('/api/radius?caseId=1&radius=1000');
    expect(area.status).toBe(200);
    for (const f of area.body.farms)
      expect(['NOT_VISITED', 'NO_SIGNS', 'SICK_ANIMALS']).toContain(f.monitoring);
    expect(area.body.totals.notVisited).toBeGreaterThanOrEqual(0);
  });

  it('builds the monthly summary and global search', async () => {
    const m = await admin.get(`/api/monthly-summary?month=${isoMonth()}`);
    expect(m.status).toBe(200);
    expect(m.body.trend).toHaveLength(6);
    expect(m.body.services.find((s: { type: string }) => s.type === 'DEWORMING').head).toBeGreaterThanOrEqual(
      12,
    );
    expect(m.body.visits.total).toBeGreaterThanOrEqual(1);
    expect((await admin.get('/api/monthly-summary?month=bad')).status).toBe(400);
    const s = await admin.get('/api/search?q=farm');
    expect(s.status).toBe(200);
    expect(s.body.some((x: { type: string }) => x.type === 'Farm')).toBe(true);
  });
});
