import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isoDate, isoMonth } from '@livestock/shared';
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
  viewer = await agentFor('tech@nagacityvet.gov.ph');
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
    // A field technician records field work but cannot review or manage accounts.
    expect((await viewer.get('/api/owners')).status).toBe(200);
    expect((await viewer.get('/api/users')).status).toBe(403);
    expect((await viewer.get('/api/audit')).status).toBe(403);
    expect((await viewer.post('/api/cases/1/close').send({})).status).toBe(403);
    expect((await viewer.post('/api/cases/1/void').send({ reason: 'x' })).status).toBe(403);
    // A veterinarian reviews, but accounts and the audit log are the administrator's.
    const vet = await agentFor('mark@nagacityvet.gov.ph');
    expect((await vet.get('/api/users')).status).toBe(403);
    expect((await vet.get('/api/audit')).status).toBe(403);
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
    expect(types).toHaveLength(35);
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
      .send({ ownerId: 1, farmId: 1, species: 'Pig', disease: 'ASF', affected: 3, deaths: 0 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      lat: 13.638,
      lng: 123.238,
      locationSource: 'Farm Coordinates',
      status: 'SUSPECTED',
    });
    // The status is never typed in: adding a sample moves the case on by itself.
    const lab = await admin.post(`/api/cases/${res.body.id}/labs`).send({ sampleId: 'AUTO-1' });
    expect(lab.body.caseStatus).toBe('SAMPLE_COLLECTED');
    const { body } = await admin.get(`/api/cases/${res.body.id}`);
    expect(body.history.map((h: { status: string }) => h.status)).toEqual([
      'SAMPLE_COLLECTED',
      'SUSPECTED',
      'SUSPECTED',
    ]);
    expect(body.history[0].note).toMatch(/Status set from the laboratory samples/);
    await admin.post(`/api/labs/${lab.body.id}/void`).send({ reason: 'Test sample' });
    expect((await admin.get(`/api/cases/${res.body.id}`)).body.case.status).toBe('SUSPECTED');
  });

  it('rejects a farm that does not belong to the owner', async () => {
    const res = await admin
      .post('/api/cases')
      .send({ ownerId: 2, farmId: 1, species: 'Pig', disease: 'ASF', affected: 1, deaths: 0 });
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
      .send({ breed: 'Native', sex: 'Mixed', healthStatus: 'Healthy' });
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
    const tooMany = await admin.post('/api/cases').send({ ...base, species: 'Pig', affected: 999 });
    expect(tooMany.body.fieldErrors.affected[0]).toMatch(/only 40 Pig/);
    const dates = await admin.post('/api/cases').send({
      ...base,
      species: 'Pig',
      affected: 1,
      reportedAt: '2026-10-01',
      symptomsDate: '2026-10-05',
    });
    expect(dates.body.fieldErrors.symptomsDate).toBeDefined();
    const future = await admin
      .post('/api/cases')
      .send({ ...base, species: 'Pig', affected: 1, reportedAt: '2099-01-01' });
    expect(future.body.fieldErrors.reportedAt[0]).toMatch(/future/);
  });

  it('the status follows the laboratory samples; there is no manual status change', async () => {
    const t = isoDate();
    const c = await admin
      .post('/api/cases')
      .send({ ownerId: 1, farmId: 1, species: 'Pig', disease: 'ASF', affected: 2, deaths: 0 });
    const id = c.body.id;
    expect((await admin.post(`/api/cases/${id}/status`).send({ status: 'POSITIVE' })).status).toBe(404);
    const status = async () => (await admin.get(`/api/cases/${id}`)).body.case.status;
    const a = await admin.post(`/api/cases/${id}/labs`).send({ sampleId: 'FLOW-1', collectedAt: t });
    expect(await status()).toBe('SAMPLE_COLLECTED');
    const lab = { sampleId: 'FLOW-1', collectedAt: t, sentAt: t };
    await admin.patch(`/api/labs/${a.body.id}`).send(lab);
    expect(await status()).toBe('SENT_TO_LAB');
    // Inconclusive: back to suspected until a new sample is taken.
    await admin.patch(`/api/labs/${a.body.id}`).send({ ...lab, result: 'INCONCLUSIVE', resultDate: t });
    expect(await status()).toBe('SUSPECTED');
    // While a sample waits for its result the case cannot be closed.
    const b = await admin
      .post(`/api/cases/${id}/labs`)
      .send({ sampleId: 'FLOW-2', collectedAt: t, sentAt: t });
    const waiting = await admin.post(`/api/cases/${id}/close`).send({ outcome: 'NOT_CONFIRMED', note: 'x' });
    expect(waiting.body.error).toMatch(/waiting for a laboratory result/);
    // A negative result makes it negative; a positive one always wins.
    await admin
      .patch(`/api/labs/${b.body.id}`)
      .send({ sampleId: 'FLOW-2', collectedAt: t, sentAt: t, result: 'NEGATIVE', resultDate: t });
    expect(await status()).toBe('NEGATIVE');
    // The closing reason must fit the result.
    const wrong = await admin.post(`/api/cases/${id}/close`).send({ outcome: 'DEPOPULATED', note: 'x' });
    expect(wrong.body.fieldErrors.outcome).toBeDefined();
    await admin
      .post(`/api/cases/${id}/labs`)
      .send({ sampleId: 'FLOW-3', collectedAt: t, sentAt: t, result: 'POSITIVE', resultDate: t });
    expect(await status()).toBe('POSITIVE');
    const notConfirmed = await admin
      .post(`/api/cases/${id}/close`)
      .send({ outcome: 'NOT_CONFIRMED', note: 'x' });
    expect(notConfirmed.body.fieldErrors.outcome).toBeDefined();
    const ok = await admin.post(`/api/cases/${id}/close`).send({ outcome: 'CONTAINED', note: 'Done' });
    expect(ok.status).toBe(200);
  });

  it('a case never tested can be closed as not confirmed', async () => {
    const c = await admin
      .post('/api/cases')
      .send({ ownerId: 1, farmId: 1, species: 'Pig', disease: 'Swine flu', affected: 1, deaths: 0 });
    const r = await admin
      .post(`/api/cases/${c.body.id}/close`)
      .send({ outcome: 'NOT_CONFIRMED', note: 'Animals recovered in two days; owner refused sampling' });
    expect(r.status).toBe(200);
  });

  it('a site visit updates the deaths; a linked field visit counts as the site visit', async () => {
    const t = isoDate();
    const c = await admin
      .post('/api/cases')
      .send({ ownerId: 1, farmId: 1, species: 'Pig', disease: 'ASF', affected: 2, deaths: 0 });
    const id = c.body.id;
    const due = async () =>
      (await admin.get('/api/case-worklist')).body.visits.find((v: { caseId: number }) => v.caseId === id);
    expect((await due()).kind).toBe('INITIAL');
    await admin.post('/api/farm-visits').send({ farmId: 1, caseId: id, date: t, purpose: 'MONITORING' });
    expect(await due()).toBeUndefined();
    const inv = await admin
      .post(`/api/cases/${id}/investigations`)
      .send({ date: t, deadCount: 3, notes: 'Three dead' });
    expect(inv.body.deathsUpdated).toEqual({ from: 0, to: 3 });
    const { body } = await admin.get(`/api/cases/${id}`);
    expect(body.case).toMatchObject({ deaths: 3, affected: 3, pendingPopulation: 3 });
    await admin.post(`/api/cases/${id}/population-reconciled`);
    expect(
      (await admin.post(`/api/cases/${id}/close`).send({ outcome: 'NOT_CONFIRMED', note: 'x' })).status,
    ).toBe(200);
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

  it('reviewers can void a record with a reason; it leaves the figures', async () => {
    const v = await admin.post('/api/vaccinations').send({
      farmId: 13,
      target: 'GROUP',
      groupId: 29,
      count: 5,
      vaccine: 'Wrong entry',
      doseNumber: 1,
    });
    expect((await viewer.post(`/api/vaccinations/${v.body.id}/void`).send({ reason: 'x' })).status).toBe(403);
    // Reviewers (veterinarian, administrator) can void; a reason is required.
    const mark = await agentFor('mark@nagacityvet.gov.ph');
    expect((await mark.post(`/api/vaccinations/${v.body.id}/void`).send({ reason: '' })).status).toBe(400);
    const ok = await mark
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
    const pcic = await admin
      .post('/api/owners/1/pcic')
      .send({ species: 'Pig', applicationDate: '2099-01-01' });
    expect(pcic.body.fieldErrors.applicationDate).toBeDefined();
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
    expect(body.history.map((h: { note: string }) => h.note).join('\n')).toMatch(
      /Lab record RADDL-T1 updated — .*sent — → /,
    );
    expect(body.labs.find((l: { id: number }) => l.id === add.body.id)).toMatchObject({
      testMethod: 'PCR',
      labReference: 'R5-2026-118',
      updatedBy: expect.any(String),
    });
    // CASE-0001 is Positive: correcting its result corrects the status too.
    const posLab = (await admin.get('/api/cases/1')).body.labs.find(
      (l: { result: string }) => l.result === 'POSITIVE',
    );
    const change = await admin.patch(`/api/labs/${posLab.id}`).send({ ...posLab, result: 'NEGATIVE' });
    expect(change.body.caseStatus).toBe('NEGATIVE');
    const back = await admin.patch(`/api/labs/${posLab.id}`).send({ ...posLab, result: 'POSITIVE' });
    expect(back.body.caseStatus).toBe('POSITIVE');
  });

  it('planned responses may be future-dated and get completed; closing needs an outcome', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const fd = isoDate(future);
    const notPlanned = await admin.post('/api/cases/1/responses').send({ type: 'QUARANTINE', date: fd });
    expect(notPlanned.body.fieldErrors.date[0]).toMatch(/planned/);
    const planned = await admin
      .post('/api/cases/1/responses')
      .send({ type: 'QUARANTINE', status: 'PLANNED', date: fd, endDate: fd, location: 'Farm 1' });
    expect(planned.status).toBe(201);
    // Response measures no longer block closing a case (Response Activities was removed from the UI).
    const noLift = await admin
      .patch(`/api/responses/${planned.body.id}`)
      .send({ type: 'QUARANTINE', status: 'COMPLETED', date: '2026-10-01', location: 'Farm 1' });
    expect(noLift.body.fieldErrors.endDate[0]).toMatch(/lifted/);
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
      (
        await admin
          .patch(`/api/responses/${planned.body.id}`)
          .send({ type: 'QUARANTINE', endDate: '2026-10-15' })
      ).body.error,
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
      .send({ farmId: 13, species: 'Ducks', count: 5, reportingMonth: isoMonth() });
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
    expect(close.body.error).toMatch(/head count/);
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
      nextDate: isoDate(soon),
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

  it('PCIC insurance: the scanned application with its date, type and RSBSA subsidy; status can be updated', async () => {
    const p = await admin.post('/api/owners/2/pcic').send({
      species: 'Pig',
      applicationDate: '2026-01-05',
      applicationType: 'NEW',
      subsidized: true,
      rsbsaRef: 'RSBSA-REF-1',
      fileKeys: ['documents/2026-01/pcic-application.pdf'],
    });
    expect(p.status).toBe(201);
    const noDate = await admin.post('/api/owners/2/pcic').send({ species: 'Pig' });
    expect(noDate.body.fieldErrors.applicationDate).toBeDefined();
    const saved = (await admin.get('/api/owners/2')).body.pcic.find(
      (x: { id: number }) => x.id === p.body.id,
    );
    expect(saved).toMatchObject({
      applicationDate: '2026-01-05',
      applicationType: 'NEW',
      subsidized: true,
      rsbsaRef: 'RSBSA-REF-1',
      fileKeys: ['documents/2026-01/pcic-application.pdf'],
      status: 'ACTIVE',
    });
    const claim = await admin.patch(`/api/owners/pcic/${p.body.id}`).send({
      species: 'Pig',
      applicationDate: '2026-01-05',
      applicationType: 'NEW',
      status: 'CLAIMED',
      remarks: 'Claim paid',
    });
    expect(claim.status).toBe(200);
    expect(
      (await admin.get('/api/owners/2')).body.pcic.find((x: { id: number }) => x.id === p.body.id),
    ).toMatchObject({ status: 'CLAIMED', remarks: 'Claim paid', subsidized: false, rsbsaRef: null });
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
    await admin.patch(`/api/users/${mark!.id}`).send({ role: 'TECHNICIAN' });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', refresh)).status).toBe(401);
    await admin.patch(`/api/users/${mark!.id}`).send({ role: 'VETERINARIAN' });
  });
});

describe('usability additions', () => {
  it('moves a tagged animal to another group on the same farm', async () => {
    // NC-C-0007 is in GRP-0021 (farm 10, cattle).
    const g = await admin.post('/api/population/groups').send({ farmId: 10, species: 'Cattle', count: 5 });
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
  const today = isoDate();

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

  it('records a violation (no fine or penalty), then closes the incident', async () => {
    const s = await admin
      .post('/api/strays')
      .send({ species: 'Goat', barangay: 'Pacol', location: 'Highway shoulder', ownerId: 5 });
    expect(s.status).toBe(201);
    const url = `/api/strays/${s.body.id}`;
    // Only two statuses remain: Reported and Closed.
    const old = await admin.patch(url).send({ status: 'IMPOUNDED' });
    expect(old.status).toBe(400);
    const marked = await admin.patch(url).send({
      violationType: 'Animal on a public road or highway',
      violations: '1',
      // Fine and payment fields are no longer part of the record: they are ignored.
      fineAmount: '500',
      orNumber: 'OR-778812',
    });
    expect(marked.status).toBe(200);
    expect(marked.body).toMatchObject({ status: 'REPORTED', violations: 1 });
    expect(marked.body.fineAmount).toBeUndefined();
    expect(marked.body.orNumber).toBeUndefined();
    expect(marked.body.impoundPlace).toBeUndefined();
    // Sending only the remarks keeps everything else.
    await admin.patch(url).send({ remarks: 'Owner informed by phone' });
    const kept = (await admin.get(url)).body;
    expect(kept).toMatchObject({ status: 'REPORTED', violationType: 'Animal on a public road or highway' });
    const summary = (await admin.get('/api/strays/owner/5/summary')).body;
    expect(summary.unpaidFines).toBeUndefined();
    const done = await admin.patch(url).send({ status: 'CLOSED' });
    expect(done.status).toBe(200);
    const report = (await admin.get('/api/reports/stray-incidents')).body;
    const row = report.rows.find((r: { code: string }) => r.code === s.body.code);
    expect(row.fine).toBeUndefined();
    expect(row.status).toBe('Closed');
    expect(report.columns.some((c: { key: string }) => c.key === 'fine' || c.key === 'impound')).toBe(false);
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

  it('keeps unsent farm fields on a partial update; the outbreak radius uses the farm pin only', async () => {
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
    // Pastures are no longer used: a pasture pin near the case does not bring the farm into the radius.
    const still = (await admin.get('/api/radius?caseId=1&radius=1000')).body;
    expect(still.farms.some((x: { id: number }) => x.id === 28)).toBe(false);
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
      species: 'Cattle',
      heads: 1,
      applicationDate: today,
      applicationType: 'NEW',
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
    const twice = await admin.post(url).send({ ...base, animalIds: [c1] });
    expect(twice.body.fieldErrors.animalIds[0]).toMatch(/already on the insurance application of/);
    const tag = (await prisma.animal.findUnique({ where: { id: c1 } }))!.earTag;
    const owner = (await admin.get(`/api/owners/${herd.ownerId}`)).body;
    expect(owner.pcic[0].animals.map((a: { earTag: string }) => a.earTag)).toEqual([tag]);
    expect((await admin.get(`/api/animals/${c1}`)).body.insurance[0].applicationDate).toBe(today);
    // Updating without the list keeps the animals; an empty list removes them.
    await admin.patch(`/api/owners/pcic/${ok.body.id}`).send({ ...base, remarks: 'Renewed' });
    expect((await admin.get(`/api/animals/${c1}`)).body.insurance).toHaveLength(1);
    const report = (await admin.get('/api/reports/pcic-policies')).body;
    expect(report.rows.find((r: { owner: string }) => r.owner === 'Insured Owner').animals).toBe(tag);
    expect(report.rows.find((r: { owner: string }) => r.owner === 'Insured Owner').file).toBe('Missing');
    await admin.patch(`/api/owners/pcic/${ok.body.id}`).send({ ...base, animalIds: [] });
    expect((await admin.get(`/api/animals/${c1}`)).body.insurance).toHaveLength(0);
  });

  it('reports RSBSA registration and incomplete records', async () => {
    const owners = await prisma.owner.findMany({ where: { status: { not: 'ARCHIVED' } } });
    const rs = (await admin.get('/api/reports/rsbsa-registration')).body;
    const total = rs.rows.reduce((a: number, r: { owners: number }) => a + r.owners, 0);
    expect(total).toBe(owners.length);
    expect(rs.summary.find((x: { label: string }) => x.label === 'With RSBSA Control No.').value).toBe(
      owners.filter((o) => o.rsbsa).length,
    );
    const o = await admin
      .post('/api/owners')
      .send({ fullName: 'Incomplete Test Owner', barangay: 'Carolina' });
    expect(o.status).toBe(201);
    const inc = (await admin.get('/api/reports/incomplete-records')).body;
    const row = inc.rows.find((r: { code: string }) => r.code === o.body.code);
    expect(row).toMatchObject({ type: 'Owner', missing: 'contact number, RSBSA Control Number' });
    expect(inc.rows.some((r: { type: string }) => r.type === 'Animal')).toBe(true);
  });

  it('keeps missed vaccination doses on the schedule as overdue', async () => {
    const day = (n: number) => isoDate(new Date(Date.now() + n * 86400_000));
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
    const sick = await freshHerd('Quarantine Owner', { Pig: 2 });
    const other = await freshHerd('Receiving Owner', { Pig: 1 });
    const c = await admin.post('/api/cases').send({
      ownerId: sick.ownerId,
      farmId: sick.farmId,
      species: 'Pig',
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
    const out = sick.animals.Pig[0];
    const blocked = await admin
      .post('/api/transfers')
      .send({ animalId: out, toFarmId: other.farmId, date: today });
    expect(blocked.status).toBe(400);
    expect(blocked.body.fieldErrors.date[0]).toMatch(new RegExp(`under quarantine for ${c.body.code}`));
    const into = await admin
      .post('/api/transfers')
      .send({ animalId: other.animals.Pig[0], toFarmId: sick.farmId, date: today });
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
  const today = isoDate();
  const tomorrow = isoDate(new Date(Date.now() + 86_400_000));

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
    await admin.post('/api/population/groups').send({ farmId: f.body.id, species: 'Pig', count: 5 });
    const c = await admin.post('/api/cases').send({
      ownerId: o.body.id,
      farmId: f.body.id,
      species: 'Pig',
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
    await admin.post('/api/population/groups').send({ farmId: f.body.id, species: 'Pig', count: 5 });
    const c = await admin.post('/api/cases').send({
      ownerId: o.body.id,
      farmId: f.body.id,
      species: 'Pig',
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
  const today = isoDate();
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
      'Stray livestock',
    ]);
    expect(r.body.rows.some((x: { indicator: string }) => /fine/i.test(x.indicator))).toBe(false);
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
  const today = isoDate();

  it('has no delete: wrong entries are archived, voided or marked instead', async () => {
    const o = await admin.post('/api/owners').send({ fullName: 'Typo Owner', barangay: 'Pacol' });
    const f = await admin
      .post('/api/farms')
      .send({ ownerId: o.body.id, name: 'Tag Farm', type: 'backyard', barangay: 'Pacol' });
    const g = await admin
      .post('/api/population/groups')
      .send({ farmId: f.body.id, species: 'Cattle', count: 2 });
    const a = await admin.post('/api/animals').send({ groupId: g.body.id, sex: 'Female', earTag: 'DEL-1' });
    // No delete route exists for any record.
    for (const url of [
      `/api/owners/${o.body.id}`,
      `/api/farms/${f.body.id}`,
      `/api/animals/${a.body.id}`,
      '/api/strays/1',
      '/api/pcic/1',
      '/api/farm-visits/1',
      '/api/users/2',
    ])
      expect((await admin.delete(url)).status, url).toBe(404);
    // The records are all still there.
    expect((await admin.get(`/api/owners/${o.body.id}`)).status).toBe(200);
    expect((await admin.get(`/api/farms/${f.body.id}`)).status).toBe(200);
    expect((await admin.get(`/api/animals/${a.body.id}`)).status).toBe(200);
  });

  it('voids a duplicate case: it leaves the lists and figures; reopening undoes it', async () => {
    const before = (await admin.get('/api/dashboard')).body.stats;
    const c = await admin.post('/api/cases').send({
      ownerId: 1,
      farmId: 1,
      species: 'Pig',
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

  it('voids a stray report entered in error; it stays on record', async () => {
    const mk = () =>
      admin.post('/api/strays').send({
        species: 'Goat',
        barangay: 'Pacol',
        location: 'Road',
        // Yesterday morning: never in the future, whatever the time of the test.
        discoveredAt: `${isoDate(new Date(Date.now() - 86_400_000))}T08:00`,
      });
    const s2 = await mk();
    await admin.patch(`/api/strays/${s2.body.id}`).send({ status: 'CLOSED' });
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
      species: 'Pig',
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

describe('CVO revisions: masterlist, deworming, field visits, monthly report', () => {
  it('keeps head counts only: no life stage or age/sex/stage classification', async () => {
    const ok = await admin.post('/api/population/groups').send({
      farmId: 13,
      species: 'Goat',
      count: 6,
      reportingMonth: isoMonth(),
      lifeStage: 'adult',
      breakdown: { kid: 2, doe: 2 },
    });
    expect(ok.status).toBe(201);
    const farm = await admin.get('/api/farms/13');
    const g = farm.body.groups.find((x: { id: number }) => x.id === ok.body.id);
    expect(g.count).toBe(6);
    expect(g.lifeStage).toBeUndefined();
    expect(g.breakdown).toBeUndefined();
  });

  it('uses the office species list: Cattle, Carabao, Goat, Sheep, Pig, Chicken, Ducks, Goose', async () => {
    for (const species of ['Goose', 'Ducks'])
      expect(
        (await admin.post('/api/population/groups').send({ farmId: 13, species, count: 3 })).status,
      ).toBe(201);
    for (const species of ['Swine', 'Duck', 'Other Poultry', 'Other'])
      expect(
        (await admin.post('/api/population/groups').send({ farmId: 13, species, count: 3 })).status,
      ).toBe(400);
  });

  it('records deworming without a product and requires a vaccine only for vaccinations', async () => {
    const today = isoDate();
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

  it('logs field visits, shows them on the farm and marks monitored farms near a case', async () => {
    const v = await admin.post('/api/farm-visits').send({
      farmId: 13,
      date: isoDate(),
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
    const edited = await admin.patch(`/api/farm-visits/${v.body.id}`).send({ findings: 'SICK_ANIMALS' });
    expect(edited.body.findingsLabel).toBe('Sick animals found');
    // A visit entered by mistake is voided with a reason (reviewers only), never deleted.
    const wrong = await admin
      .post('/api/farm-visits')
      .send({ farmId: 13, date: isoDate(), purpose: 'ROUTINE' });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(201);
    expect((await viewer.post(`/api/farm-visits/${wrong.body.id}/void`).send({ reason: 'x' })).status).toBe(
      403,
    );
    expect((await admin.post(`/api/farm-visits/${wrong.body.id}/void`).send({ reason: '' })).status).toBe(
      400,
    );
    expect(
      (await admin.post(`/api/farm-visits/${wrong.body.id}/void`).send({ reason: 'Wrong farm' })).status,
    ).toBe(200);
    const after = (await admin.get('/api/farm-visits?farmId=13')).body;
    expect(after.some((x: { id: number }) => x.id === wrong.body.id)).toBe(false);
    expect((await prisma.farmVisit.findUnique({ where: { id: wrong.body.id } }))?.voidReason).toBe(
      'Wrong farm',
    );

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

describe('CVO forms: laboratory submissions, cattle and carabao services, search', () => {
  const today = isoDate();
  const batch = (samples: object[], extra: object = {}) =>
    admin.post('/api/lab-submissions').send({
      purpose: 'SURVEILLANCE',
      examination: 'PCR – African Swine Fever (ASF)',
      laboratory: 'RADDL Region V, San Agustin, Pili, Camarines Sur',
      submittedAt: today,
      samples,
      ...extra,
    });
  const pig = (sampleId: string, extra: object = {}) => ({
    farmId: 1,
    species: 'Pig',
    sampleId,
    sampleType: 'Blood',
    animalAge: '3 m',
    animalSex: 'M',
    condition: 'LIVE',
    collectedAt: today,
    ...extra,
  });

  it('a surveillance batch holds samples from many farms; results come back; a positive opens a case', async () => {
    // Every row is checked: the farm must raise the species, sample IDs are unique, organs for tissue.
    const bad = await batch([pig('SURV-A1'), pig('SURV-A1')]);
    expect(bad.body.fieldErrors.samples[0]).toMatch(/own sample ID/);
    const wrongSpecies = await batch([pig('SURV-A1', { farmId: 10 })]);
    expect(wrongSpecies.body.fieldErrors['samples.0.species'][0]).toMatch(/no pig on record/);
    const noOrgans = await batch([pig('SURV-A1', { condition: 'DEAD', sampleType: 'Tissue / Organs' })]);
    expect(noOrgans.status).toBe(201);
    const b = await batch([
      pig('SURV-B1'),
      pig('SURV-B2', { animalSex: 'F' }),
      pig('SURV-B3', {
        condition: 'DEAD',
        sampleType: 'Tissue / Organs',
        organs: 'Spleen, Lymph node',
        hoursSinceDeath: 6,
      }),
    ]);
    expect(b.status).toBe(201);
    expect(b.body.code).toMatch(/^SUB-\d{4}$/);
    const dup = await batch([pig('SURV-B1')]);
    expect(dup.body.fieldErrors['samples.0.sampleId'][0]).toMatch(/already used/);
    let s = (await admin.get(`/api/lab-submissions/${b.body.id}`)).body;
    expect(s).toMatchObject({ total: 3, pending: 3, barangays: [expect.any(String)], species: ['Pig'] });
    expect(s.samples[2]).toMatchObject({
      organs: 'Spleen, Lymph node',
      hoursSinceDeath: 6,
      condition: 'DEAD',
    });
    expect(s.samples[0].sentAt).toBe(today);
    // Results by email: two negative, one positive.
    const [x1, x2, x3] = s.samples.map((x: { id: number }) => x.id);
    const r = await admin.post(`/api/lab-submissions/${b.body.id}/results`).send({
      resultDate: today,
      receivedVia: 'EMAIL',
      results: [
        { id: x1, result: 'NEGATIVE' },
        { id: x2, result: 'NEGATIVE' },
        { id: x3, result: 'POSITIVE' },
      ],
    });
    expect(r.body.changed).toBe(3);
    s = (await admin.get(`/api/lab-submissions/${b.body.id}`)).body;
    expect(s).toMatchObject({ pending: 0, negative: 2, positive: 1, positiveNoCase: 1 });
    expect(s.samples[0].receivedVia).toBe('EMAIL');
    // A sample with a result cannot be dropped from the batch.
    const header = {
      purpose: 'SURVEILLANCE',
      examination: 'PCR – African Swine Fever (ASF)',
      laboratory: 'RADDL Region V',
      submittedAt: today,
    };
    const drop = await admin
      .patch(`/api/lab-submissions/${b.body.id}`)
      .send({ ...header, samples: [pig('SURV-B1', { id: x1 })] });
    expect(drop.body.error).toMatch(/already has a result/);
    // The dashboard asks for a case for the positive sample.
    const tasks = (await admin.get('/api/insights/tasks')).body;
    expect(JSON.stringify(tasks)).toMatch(new RegExp(`${s.code}: 1 positive sample`));
    // Opening a case from it attaches the sample, so the case is Positive (Active) at once.
    const c = await admin.post('/api/cases').send({
      ownerId: s.samples[2].ownerId,
      farmId: 1,
      species: 'Pig',
      disease: 'African Swine Fever (ASF)',
      affected: 1,
      deaths: 1,
      fromSampleId: x3,
    });
    expect(c.status).toBe(201);
    const detail = (await admin.get(`/api/cases/${c.body.id}`)).body;
    expect(detail.case).toMatchObject({ status: 'POSITIVE', classification: 'ACTIVE', classLabel: 'Active' });
    expect(detail.labs[0]).toMatchObject({ sampleId: 'SURV-B3', submissionCode: s.code });
    const again = await admin.post('/api/cases').send({
      ownerId: s.samples[2].ownerId,
      farmId: 1,
      species: 'Pig',
      disease: 'ASF',
      affected: 1,
      deaths: 0,
      fromSampleId: x3,
    });
    expect(again.body.error).toMatch(/already on a disease case/);
    // Close it again so later tests see the same open cases.
    await admin.post(`/api/cases/${c.body.id}/void`).send({ reason: 'Test case' });
  });

  it('a sample sent for an open case moves it: positive sets the zone at once, a correction lifts it', async () => {
    const c = await admin.post('/api/cases').send({
      ownerId: 1,
      farmId: 1,
      species: 'Pig',
      disease: 'African Swine Fever (ASF)',
      affected: 2,
      deaths: 0,
    });
    expect(c.status).toBe(201);
    const b = await batch([pig('INV-LINK-1')], { purpose: 'DISEASE_INVESTIGATION' });
    expect(b.status).toBe(201);
    let s = (await admin.get(`/api/lab-submissions/${b.body.id}`)).body;
    expect(s.samples[0].caseId).toBe(c.body.id);
    await admin.post(`/api/lab-submissions/${b.body.id}/results`).send({
      resultDate: today,
      results: [{ id: s.samples[0].id, result: 'POSITIVE' }],
    });
    let detail = (await admin.get(`/api/cases/${c.body.id}`)).body;
    expect(detail.case.status).toBe('POSITIVE');
    const zone = (await admin.get('/api/zones')).body.find(
      (z: { caseId: number; status: string }) => z.caseId === c.body.id && z.status === 'ACTIVE',
    );
    expect(zone).toBeTruthy();
    // The result was typed wrong: corrected to negative, the zone is lifted.
    await admin.post(`/api/lab-submissions/${b.body.id}/results`).send({
      resultDate: today,
      results: [{ id: s.samples[0].id, result: 'NEGATIVE' }],
    });
    detail = (await admin.get(`/api/cases/${c.body.id}`)).body;
    expect(detail.case.status).toBe('NEGATIVE');
    s = (await admin.get(`/api/zones/${zone.id}`)).body;
    expect(s).toMatchObject({ status: 'LIFTED', liftReason: expect.stringMatching(/corrected/) });
    await admin.post(`/api/cases/${c.body.id}/void`).send({ reason: 'Test case' });
  });

  it('cases are classified Reported → Suspected → Active / Negative → Closed', async () => {
    const c = await admin.post('/api/cases').send({
      ownerId: 1,
      farmId: 1,
      species: 'Pig',
      disease: 'ASF',
      affected: 1,
      deaths: 0,
      clinicalSigns: ['FEVER', 'SKIN_REDNESS'],
    });
    const get = async () => (await admin.get(`/api/cases/${c.body.id}`)).body.case;
    expect(await get()).toMatchObject({
      classification: 'REPORTED',
      clinicalSigns: ['FEVER', 'SKIN_REDNESS'],
    });
    await admin.post(`/api/cases/${c.body.id}/investigations`).send({ date: today, notes: 'Visited' });
    expect((await get()).classification).toBe('SUSPECTED');
    await admin.post(`/api/cases/${c.body.id}/void`).send({ reason: 'Test case' });
    expect((await get()).classification).toBe('CLOSED');
  });

  it('pregnancy diagnosis and insemination are for cattle and carabao; the monthly report counts per species', async () => {
    const groups = await prisma.populationGroup.findMany({ where: { archived: false } });
    const g = groups.find((x) => x.species === 'Goat' && x.count > 0)!;
    const k = groups.find((x) => x.species === 'Carabao' && x.count > 0)!;
    const pdGoat = await admin.post('/api/vaccinations').send({
      farmId: g.farmId,
      target: 'GROUP',
      groupId: g.id,
      count: 1,
      serviceType: 'PREGNANCY_DIAGNOSIS',
      result: 'PREGNANT',
      date: today,
    });
    expect(pdGoat.body.fieldErrors.groupId[0]).toMatch(/cattle and carabao only/);
    const noResult = await admin.post('/api/vaccinations').send({
      farmId: k.farmId,
      target: 'GROUP',
      groupId: k.id,
      count: 1,
      serviceType: 'PREGNANCY_DIAGNOSIS',
      date: today,
    });
    expect(noResult.body.fieldErrors.result).toBeDefined();
    const pd = await admin.post('/api/vaccinations').send({
      farmId: k.farmId,
      target: 'GROUP',
      groupId: k.id,
      count: 1,
      serviceType: 'PREGNANCY_DIAGNOSIS',
      result: 'PREGNANT',
      date: today,
    });
    expect(pd.status).toBe(201);
    const ai = await admin.post('/api/vaccinations').send({
      farmId: k.farmId,
      target: 'GROUP',
      groupId: k.id,
      count: 1,
      serviceType: 'INSEMINATION',
      vaccine: 'Murrah semen',
      date: today,
    });
    expect(ai.status).toBe(201);
    const m = (await admin.get(`/api/monthly-summary?month=${today.slice(0, 7)}`)).body;
    const row = m.perSpecies.find((x: { species: string }) => x.species === 'Carabao');
    expect(row.pregnancyDiagnosis).toBeGreaterThanOrEqual(1);
    expect(row.pregnant).toBeGreaterThanOrEqual(1);
    expect(row.inseminated).toBeGreaterThanOrEqual(1);
    expect(m.lab.collected).toBeGreaterThanOrEqual(3);
    // The group's activity log shows the services.
    const log = (await admin.get(`/api/population/groups/${k.id}/activity`)).body;
    expect(log.some((x: { title: string }) => /Pregnancy Diagnosis/.test(x.title))).toBe(true);
    expect(log.some((x: { title: string }) => /Artificial Insemination/.test(x.title))).toBe(true);
  });

  it('cattle and carabao keep their purpose and ownership certificate; edits are logged field by field', async () => {
    const a = await prisma.animal.findFirst({ where: { species: 'Carabao', status: 'ACTIVE' } });
    const r = await admin.patch(`/api/animals/${a!.id}`).send({
      purpose: 'DRAFT',
      colcNo: 'COLC-2026-0042',
      colcDate: today,
      colcFileKeys: ['documents/colc.pdf'],
    });
    expect(r.status).toBe(200);
    const d = (await admin.get(`/api/animals/${a!.id}`)).body;
    expect(d.animal).toMatchObject({
      purpose: 'DRAFT',
      purposeLabel: 'Draft',
      colcNo: 'COLC-2026-0042',
      colcFileKeys: ['documents/colc.pdf'],
    });
    expect(d.history[0].summary).toMatch(/purpose — → DRAFT; ownership certificate no\. — → COLC-2026-0042/);
    const found = (await admin.get('/api/search?q=COLC-2026-0042&limit=20')).body;
    expect(found[0]).toMatchObject({ type: 'Animal' });
  });

  it('the search narrows by type, barangay and species', async () => {
    const all = (await admin.get('/api/search?q=SURV-B&limit=50')).body;
    expect(all.some((x: { type: string }) => x.type === 'Sample')).toBe(true);
    const batches = (await admin.get('/api/search?q=SUB-&type=submission&limit=50')).body;
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every((x: { type: string }) => x.type === 'Lab batch')).toBe(true);
    const pacolPigs = (await admin.get('/api/search?barangay=Pacol&species=Pig&limit=100')).body;
    expect(pacolPigs.length).toBeGreaterThan(0);
    expect(pacolPigs.every((x: { barangay?: string }) => x.barangay === 'Pacol')).toBe(true);
  });
});

describe('accounts, roles and the audit trail', () => {
  const fresh = () => request.agent(app);
  const login = (agent: request.Agent, email: string, password: string) =>
    agent.post('/api/auth/login').send({ email, password });

  it('creates a staff account with a temporary password that must be changed at first sign-in', async () => {
    const bad = await admin
      .post('/api/users')
      .send({ name: 'X', email: 'x@nagacityvet.gov.ph', role: 'OWNER' });
    expect(bad.status).toBe(400);
    const made = await admin.post('/api/users').send({
      name: 'Nena Field',
      email: 'nena@nagacityvet.gov.ph',
      role: 'TECHNICIAN',
      title: 'Field Technician',
    });
    expect(made.status).toBe(201);
    const temp = made.body.temporaryPassword as string;
    expect(temp).toMatch(/[A-Za-z]/);
    expect(made.body.mustChangePassword).toBe(true);

    const nena = fresh();
    const first = await login(nena, 'nena@nagacityvet.gov.ph', temp);
    expect(first.status).toBe(200);
    expect(first.body.user.mustChangePassword).toBe(true);
    // Nothing else works until the temporary password is changed.
    const blocked = await nena.get('/api/owners');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    // The new password must follow the rule and differ from the temporary one.
    const weak = await nena
      .post('/api/auth/change-password')
      .send({ current: temp, password: 'short', confirm: 'short' });
    expect(weak.status).toBe(400);
    const sameAgain = await nena
      .post('/api/auth/change-password')
      .send({ current: temp, password: temp, confirm: temp });
    expect(sameAgain.status).toBe(400);
    const wrongCurrent = await nena
      .post('/api/auth/change-password')
      .send({ current: 'nope', password: 'Bagong#2026', confirm: 'Bagong#2026' });
    expect(wrongCurrent.body.fieldErrors.current[0]).toMatch(/not correct/);
    const ok = await nena
      .post('/api/auth/change-password')
      .send({ current: temp, password: 'Bagong#2026', confirm: 'Bagong#2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.mustChangePassword).toBe(false);
    expect((await nena.get('/api/owners')).status).toBe(200);
    expect((await login(fresh(), 'nena@nagacityvet.gov.ph', temp)).status).toBe(401);
  });

  it('locks an account after repeated wrong passwords; the administrator unlocks or resets it', async () => {
    const email = 'nena@nagacityvet.gov.ph';
    const nena = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({ where: { id: nena!.id }, data: { failedLogins: 0 } });
    for (let i = 1; i <= 4; i++) {
      const r = await login(fresh(), email, 'wrong-password');
      expect(r.status).toBe(401);
      expect(r.body.error).toContain(`${5 - i} more wrong`);
    }
    const fifth = await login(fresh(), email, 'wrong-password');
    expect(fifth.status).toBe(423);
    expect(fifth.body.error).toMatch(/locked/);
    // Even the right password is refused while the account is locked.
    expect((await login(fresh(), email, 'Bagong#2026')).status).toBe(423);
    const list = (await admin.get('/api/users')).body;
    expect(list.find((u: { id: number }) => u.id === nena!.id)).toMatchObject({ locked: true });
    expect((await admin.post(`/api/users/${nena!.id}/unlock`)).status).toBe(200);
    expect((await login(fresh(), email, 'Bagong#2026')).status).toBe(200);

    // A forgotten password: a new temporary one, to be changed at the next sign-in.
    const reset = await admin.post(`/api/users/${nena!.id}/reset-password`);
    expect(reset.status).toBe(200);
    expect((await login(fresh(), email, 'Bagong#2026')).status).toBe(401);
    const again = await login(fresh(), email, reset.body.temporaryPassword);
    expect(again.body.user.mustChangePassword).toBe(true);
    // Sign-in failures, the lock and the reset are all in the audit log.
    const log = (await admin.get(`/api/audit?table=User&recordId=${nena!.id}`)).body;
    const actions = log.rows.map((r: { action: string }) => r.action);
    for (const a of ['LOGIN_FAILED', 'LOCKED', 'UNLOCKED', 'PASSWORD_RESET', 'LOGIN', 'PASSWORD_CHANGED'])
      expect(actions, a).toContain(a);
  });

  it('suspends and deactivates accounts instead of deleting; open cases must be reassigned first', async () => {
    const mark = await prisma.user.findUnique({ where: { email: 'mark@nagacityvet.gov.ph' } });
    const joy = await prisma.user.findUnique({ where: { email: 'joy@nagacityvet.gov.ph' } });
    const me = await prisma.user.findUnique({ where: { email: 'admin@nagacityvet.gov.ph' } });
    expect((await admin.patch(`/api/users/${me!.id}`).send({ status: 'DEACTIVATED' })).status).toBe(400);
    expect((await admin.patch(`/api/users/${me!.id}`).send({ role: 'TECHNICIAN' })).status).toBe(400);

    // Give Mark an open case, then try to deactivate him.
    const open = await prisma.diseaseCase.findFirst({ where: { closedAt: null, voidedAt: null } });
    await prisma.diseaseCase.update({ where: { id: open!.id }, data: { assignedToId: mark!.id } });
    const refused = await admin.patch(`/api/users/${mark!.id}`).send({ status: 'DEACTIVATED' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('REASSIGN_REQUIRED');
    expect(refused.body.openCases.some((c: { id: number }) => c.id === open!.id)).toBe(true);
    expect((await admin.post(`/api/users/${mark!.id}/reassign`).send({ toUserId: mark!.id })).status).toBe(
      400,
    );
    const moved = await admin.post(`/api/users/${mark!.id}/reassign`).send({ toUserId: joy!.id });
    expect(moved.body.reassigned).toBeGreaterThanOrEqual(1);
    expect((await prisma.diseaseCase.findUnique({ where: { id: open!.id } }))?.assignedToId).toBe(joy!.id);

    const off = await admin.patch(`/api/users/${mark!.id}`).send({ status: 'DEACTIVATED' });
    expect(off.body.status).toBe('DEACTIVATED');
    const denied = await login(fresh(), 'mark@nagacityvet.gov.ph', 'Livestock@2026');
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/deactivated/);
    // The account and everything recorded under the name are still there.
    expect(await prisma.user.findUnique({ where: { id: mark!.id } })).not.toBeNull();
    // Suspended is temporary; both can be made active again.
    expect((await admin.patch(`/api/users/${mark!.id}`).send({ status: 'SUSPENDED' })).body.status).toBe(
      'SUSPENDED',
    );
    expect((await login(fresh(), 'mark@nagacityvet.gov.ph', 'Livestock@2026')).body.error).toMatch(
      /suspended/,
    );
    expect((await admin.patch(`/api/users/${mark!.id}`).send({ status: 'ACTIVE' })).body.status).toBe(
      'ACTIVE',
    );
    expect((await login(fresh(), 'mark@nagacityvet.gov.ph', 'Livestock@2026')).status).toBe(200);
  });

  it('writes every change to the audit log with who, when, and the old and new values', async () => {
    const o = await admin
      .post('/api/owners')
      .send({ fullName: 'Audit Trail Owner', barangay: 'Pacol', contact: '09170000001' });
    await admin
      .patch(`/api/owners/${o.body.id}`)
      .send({ fullName: 'Audit Trail Owner', barangay: 'Carolina', contact: '09170000002' });
    const hist = (await admin.get(`/api/audit/record/Owner/${o.body.id}`)).body;
    expect(hist[0]).toMatchObject({ action: 'CREATE', byName: 'Dr. Liza Admin', source: 'web' });
    expect(hist[0].changes.fullName).toBe('Audit Trail Owner');
    const upd = hist.find((h: { action: string }) => h.action === 'UPDATE');
    expect(upd.changes.barangay).toEqual(['Pacol', 'Carolina']);
    expect(upd.changes.contact).toEqual(['09170000001', '09170000002']);
    expect(upd.userId).toBeGreaterThan(0);
    // A password never appears in the log.
    const all = JSON.stringify((await admin.get('/api/audit?table=User')).body.rows);
    expect(all).not.toMatch(/\$2[aby]\$/);
  });

  it('refuses to edit or delete audit entries, even directly in the database', async () => {
    const before = (await admin.get('/api/audit')).body;
    expect(before.databaseLock).toBe('on');
    expect(before.total).toBeGreaterThan(0);
    const id = before.rows[0].id;
    expect((await admin.delete(`/api/audit/${id}`)).status).toBe(404);
    expect((await admin.patch(`/api/audit/${id}`).send({ note: 'x' })).status).toBe(404);
    const { basePrisma } = await import('../src/db');
    await expect(
      basePrisma.auditEntry.update({ where: { id }, data: { note: 'tampered' } }),
    ).rejects.toThrow();
    await expect(basePrisma.auditEntry.delete({ where: { id } })).rejects.toThrow();
    await expect(basePrisma.activityLog.deleteMany()).rejects.toThrow();
    expect((await basePrisma.auditEntry.findUnique({ where: { id } }))?.note).not.toBe('tampered');
  });

  it('logs exports and filters the log', async () => {
    expect(
      (await admin.post('/api/audit/export').send({ report: 'Owner Registry', format: 'XLSX', rows: 20 }))
        .status,
    ).toBe(201);
    const exp = (await admin.get('/api/audit?action=EXPORT')).body;
    expect(exp.rows[0].note).toMatch(/Owner Registry exported as XLSX \(20 rows\)/);
    expect(exp.tables).toContain('Owner');
    const mine = (await admin.get('/api/audit?q=Liza')).body;
    expect(mine.total).toBeGreaterThan(0);
  });

  it('keeps livestock owner logins out of the CVO system', async () => {
    const { default: bcrypt } = await import('bcryptjs');
    const owner = await prisma.owner.findFirst();
    await prisma.user.create({
      data: {
        name: owner!.fullName,
        email: 'owner.test@example.com',
        role: 'OWNER',
        ownerId: owner!.id,
        passwordHash: await bcrypt.hash('Owner#2026', 10),
      },
    });
    const agent = fresh();
    const r = await login(agent, 'owner.test@example.com', 'Owner#2026');
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ role: 'OWNER', ownerId: owner!.id });
    for (const url of [
      '/api/owners',
      '/api/farms',
      '/api/cases',
      '/api/dashboard',
      '/api/users',
      '/api/audit',
    ])
      expect((await agent.get(url)).status, url).toBe(403);
    // Owner logins are not listed with the staff accounts.
    const staff = (await admin.get('/api/users')).body;
    expect(staff.some((u: { email: string }) => u.email === 'owner.test@example.com')).toBe(false);
  });
});

describe('the owner app: registration, head counts, reports, alerts', () => {
  const fresh = () => request.agent(app);
  let ana: request.Agent; // a new owner
  let ben: request.Agent; // her neighbour
  let anaOwnerId = 0;
  let anaFarmId = 0;
  let benFarmId = 0;
  let caseId = 0;
  const PIN = { lat: 13.6551, lng: 123.2241 }; // Pacol
  const reg = (over: Record<string, unknown> = {}) => ({
    fullName: 'Ana Reyes',
    phone: '0917 555 0101',
    barangay: 'Pacol',
    idType: 'PHILSYS',
    idNumber: '1234-5678-9012',
    password: 'Kalabaw#2026',
    confirm: 'Kalabaw#2026',
    consent: true,
    ...over,
  });
  // A 1x1 PNG standing in for the photo of an ID.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  /** Sign up the way the owner app does: details as JSON, the ID photo as a file. */
  const signUp = (
    agent: request.Agent | ReturnType<typeof request.agent>,
    body: Record<string, unknown>,
    withId = true,
  ) => {
    const r = agent.post('/api/auth/register').field('data', JSON.stringify(body));
    return withId ? r.attach('idFront', PNG, { filename: 'id.png', contentType: 'image/png' }) : r;
  };
  const OWNER_OK = ['ID_READABLE', 'ID_MATCHES', 'ADDRESS_OK', 'NO_DUPLICATE'];
  const FARM_OK = ['PIN_OK', 'LIVESTOCK_OK', 'NO_DUPLICATE'];
  const farm = (over: Record<string, unknown> = {}) => ({
    name: 'Reyes Piggery',
    type: 'backyard',
    barangay: 'Pacol',
    ...PIN,
    gpsAccuracy: 12,
    livestock: [{ species: 'Pig', count: 20 }],
    ...over,
  });

  it('an owner registers, signs in with the mobile number and sees only the owner app', async () => {
    expect((await signUp(fresh(), reg({ consent: false }))).status).toBe(400);
    expect((await signUp(fresh(), reg({ phone: '12345' }))).body.fieldErrors.phone[0]).toMatch(/11-digit/);
    ana = fresh();
    // The ID photo is required.
    expect((await signUp(fresh(), reg(), false)).body.fieldErrors.idFront[0]).toMatch(/front of your ID/);
    const made = await signUp(ana, reg());
    expect(made.status).toBe(201);
    expect(made.body.user).toMatchObject({ role: 'OWNER', mustChangePassword: false });
    anaOwnerId = made.body.user.ownerId;
    // The same number cannot register twice.
    expect((await signUp(fresh(), reg())).body.fieldErrors.phone[0]).toMatch(/already has an account/);
    // Sign in with the mobile number in any common format.
    const again = fresh();
    expect(
      (await again.post('/api/auth/login').send({ email: '+63 917 555 0101', password: 'Kalabaw#2026' }))
        .status,
    ).toBe(200);
    // Pending until the office verifies.
    const home = (await ana.get('/api/my/home')).body;
    expect(home.owner).toMatchObject({ status: 'PENDING', fullName: 'Ana Reyes' });
    expect(home.farms).toEqual([]);
    // An owner cannot open the CVO system; staff cannot use the owner routes.
    for (const url of ['/api/owners', '/api/cases', '/api/review/registrations', '/api/zones'])
      expect((await ana.get(url)).status, url).toBe(403);
    expect((await admin.get('/api/my/home')).status).toBe(403);
    expect((await request(app).get('/api/my/home')).status).toBe(401);
  });

  it('a farm registration waits for review: owner first, then the farm; outside the city is refused', async () => {
    const outside = await ana.post('/api/my/farms').send(farm({ lat: 14.6, lng: 121.0 }));
    expect(outside.body.fieldErrors.lat[0]).toMatch(/outside Naga City/);
    expect((await ana.post('/api/my/farms').send(farm({ livestock: [] }))).status).toBe(400);
    const sent = await ana.post('/api/my/farms').send(farm());
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ status: 'PENDING', code: expect.stringMatching(/^REG-/) });
    expect((await ana.post('/api/my/farms').send(farm())).body.fieldErrors.name[0]).toMatch(/already sent/);
    // A pending farm is not in the masterlist, the map or the figures.
    expect(
      (await admin.get('/api/farms')).body.some((f: { name: string }) => f.name === 'Reyes Piggery'),
    ).toBe(false);

    const queue = (await admin.get('/api/review/registrations')).body;
    const o = queue.owners.find((x: { id: number }) => x.id === anaOwnerId);
    expect(o).toMatchObject({ fullName: 'Ana Reyes', contact: '09175550101' });
    const r = queue.farms.find((x: { id: number }) => x.id === sent.body.id);
    expect(r.owner.fullName).toBe('Ana Reyes');
    expect((await admin.get('/api/review/summary')).body.farms).toBeGreaterThanOrEqual(1);
    // Field technicians can look but not decide.
    expect((await viewer.get('/api/review/registrations')).status).toBe(200);
    expect((await viewer.post(`/api/review/owners/${anaOwnerId}`).send({ decision: 'APPROVE' })).status).toBe(
      403,
    );
    // The farm cannot be verified before its owner.
    expect((await admin.post(`/api/review/farms/${r.id}`).send({ decision: 'APPROVE' })).body.error).toMatch(
      /Verify the owner/,
    );
    // Returned for correction: a reason is required and the owner is told.
    expect((await admin.post(`/api/review/farms/${r.id}`).send({ decision: 'RETURN' })).status).toBe(400);
    expect(
      (
        await admin
          .post(`/api/review/farms/${r.id}`)
          .send({ decision: 'RETURN', reason: 'Pin is on the road' })
      ).status,
    ).toBe(200);
    const home = (await ana.get('/api/my/home')).body;
    expect(home.registrations[0]).toMatchObject({ status: 'RETURNED', returnReason: 'Pin is on the road' });
    expect(home.unread).toBeGreaterThanOrEqual(1);
    // She corrects it and sends it again.
    const fixed = await ana
      .patch(`/api/my/registrations/${r.id}`)
      .send(farm({ lat: 13.6553, lng: 123.2243 }));
    expect(fixed.body).toMatchObject({ status: 'PENDING', returnReason: null });

    // While pending she cannot update head counts or report (no verified farm yet).
    expect(
      (await ana.post('/api/my/population').send({ farmId: 1, species: 'Pig', reason: 'BIRTH', quantity: 1 }))
        .status,
    ).toBe(403);
    // Verifying needs every checklist item ticked.
    expect(
      (
        await admin
          .post(`/api/review/owners/${anaOwnerId}`)
          .send({ decision: 'APPROVE', checklist: ['ID_READABLE'] })
      ).body.fieldErrors.checklist[0],
    ).toMatch(/Confirm every item/);
    // Returned: she sees the reason, sends a clearer ID and goes back in the queue.
    await admin
      .post(`/api/review/owners/${anaOwnerId}`)
      .send({ decision: 'RETURN', reason: 'The ID photo is blurred' });
    expect((await ana.get('/api/my/home')).body.owner).toMatchObject({
      status: 'PENDING',
      returnReason: 'The ID photo is blurred',
    });
    const up = await ana
      .post('/api/my/uploads')
      .field('folder', 'ids')
      .attach('file', PNG, { filename: 'id2.png', contentType: 'image/png' });
    expect(
      (
        await ana
          .post('/api/my/verification')
          .send({ idType: 'PHILSYS', idNumber: '1234', idPhotoKeys: ['misc/x.png'] })
      ).status,
    ).toBe(400);
    expect(
      (
        await ana
          .post('/api/my/verification')
          .send({ idType: 'PHILSYS', idNumber: '1234-5678-9012', idPhotoKeys: [up.body.key] })
      ).status,
    ).toBe(200);
    expect((await ana.get('/api/my/home')).body.owner.returnReason).toBeNull();
    // The reviewer sees the ID; another owner cannot open it.
    const inQueue = (await admin.get('/api/review/registrations')).body.owners.find(
      (x: { id: number }) => x.id === anaOwnerId,
    );
    expect(inQueue).toMatchObject({ idTypeLabel: 'PhilSys National ID', idNumber: '1234-5678-9012' });
    expect(inQueue.history.length).toBeGreaterThanOrEqual(2);
    expect((await admin.get(inQueue.idPhotos[0].url)).status).toBe(200);
    expect((await ana.get(`/api/my/files/${up.body.key}`)).status).toBe(200);

    expect(
      (
        await admin
          .post(`/api/review/owners/${anaOwnerId}`)
          .send({ decision: 'APPROVE', checklist: OWNER_OK })
      ).status,
    ).toBe(200);
    expect((await admin.post(`/api/review/farms/${r.id}`).send({ decision: 'APPROVE' })).status).toBe(400);
    const ok = await admin
      .post(`/api/review/farms/${r.id}`)
      .send({ decision: 'APPROVE', checklist: FARM_OK });
    expect(ok.status).toBe(200);
    anaFarmId = ok.body.farmId;
    const after = (await ana.get('/api/my/home')).body;
    expect(after.owner.status).toBe('ACTIVE');
    expect(after.farms[0]).toMatchObject({
      id: anaFarmId,
      status: 'VERIFIED',
      total: 20,
      livestock: [{ species: 'Pig', count: 20 }],
    });
    expect(after.registrations).toEqual([]);
    // Now it is in the masterlist, with its head count.
    const f = (await admin.get(`/api/farms/${anaFarmId}`)).body;
    expect(f.farm ?? f).toMatchObject({ name: 'Reyes Piggery' });
    const notes = (await ana.get('/api/my/notifications')).body;
    expect(notes.map((n: { title: string }) => n.title)).toEqual(
      expect.arrayContaining(['Your registration is verified', 'Reyes Piggery is verified']),
    );
  });

  it('owners see only their own records', async () => {
    ben = fresh();
    const b = await signUp(ben, reg({ fullName: 'Ben Cruz', phone: '09175550202' }));
    await admin
      .post(`/api/review/owners/${b.body.user.ownerId}`)
      .send({ decision: 'APPROVE', checklist: OWNER_OK });
    // 300 m from Ana's farm.
    const sent = await ben.post('/api/my/farms').send(
      farm({
        name: 'Cruz Farm',
        lat: 13.6578,
        lng: 123.2243,
        livestock: [
          { species: 'Pig', count: 8 },
          { species: 'Chicken', count: 30 },
        ],
      }),
    );
    const ok = await admin
      .post(`/api/review/farms/${sent.body.id}`)
      .send({ decision: 'APPROVE', checklist: FARM_OK });
    benFarmId = ok.body.farmId;
    expect((await ben.get(`/api/my/farms/${benFarmId}`)).status).toBe(200);
    expect((await ben.get(`/api/my/farms/${anaFarmId}`)).status).toBe(404);
    expect((await ana.get(`/api/my/farms/${benFarmId}`)).status).toBe(404);
    expect(
      (
        await ben
          .post('/api/my/population')
          .send({ farmId: anaFarmId, species: 'Pig', reason: 'BIRTH', quantity: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await ben
          .post('/api/my/reports')
          .send({ farmId: anaFarmId, species: 'Pig', symptoms: 'x', affected: 1 })
      ).status,
    ).toBe(404);
  });

  it('normal head count updates are accepted automatically; unusual ones wait for a reviewer', async () => {
    const birth = await ana
      .post('/api/my/population')
      .send({ farmId: anaFarmId, species: 'Pig', reason: 'BIRTH', quantity: 6, note: 'One sow farrowed' });
    expect(birth.status).toBe(201);
    expect(birth.body).toMatchObject({
      status: 'ACCEPTED',
      flagged: false,
      before: 20,
      after: 26,
      decidedBy: 'System',
    });
    expect((await ana.get(`/api/my/farms/${anaFarmId}`)).body.livestock[0].count).toBe(26);
    // More than is there cannot be removed; a zero change is refused.
    expect(
      (
        await ana
          .post('/api/my/population')
          .send({ farmId: anaFarmId, species: 'Pig', reason: 'SALE', quantity: 99 })
      ).body.fieldErrors.quantity[0],
    ).toMatch(/Only 26 Pig/);
    expect(
      (
        await ana
          .post('/api/my/population')
          .send({ farmId: anaFarmId, species: 'Pig', reason: 'CORRECTION', quantity: 26 })
      ).status,
    ).toBe(400);
    // 20 of 26 died: more than half and at least 10 head, so it is held for review.
    const big = await ana
      .post('/api/my/population')
      .send({ farmId: anaFarmId, species: 'Pig', reason: 'DEATH', quantity: 20 });
    expect(big.body).toMatchObject({ status: 'PENDING', flagged: true });
    expect(big.body.flagReason).toMatch(/77% of the recorded 26/);
    expect((await ana.get(`/api/my/farms/${anaFarmId}`)).body.livestock[0].count).toBe(26);
    expect(
      (
        await ana
          .post('/api/my/population')
          .send({ farmId: anaFarmId, species: 'Pig', reason: 'BIRTH', quantity: 1 })
      ).body.error,
    ).toMatch(/still waiting for review/);
    const queue = (await admin.get('/api/review/population')).body;
    expect(queue.find((q: { id: number }) => q.id === big.body.id)).toMatchObject({
      reasonLabel: 'Died',
      quantity: -20,
    });
    expect(
      (await viewer.post(`/api/review/population/${big.body.id}`).send({ decision: 'ACCEPT' })).status,
    ).toBe(403);
    expect(
      (await admin.post(`/api/review/population/${big.body.id}`).send({ decision: 'CANCEL' })).status,
    ).toBe(400);
    expect(
      (
        await admin
          .post(`/api/review/population/${big.body.id}`)
          .send({ decision: 'CANCEL', reason: 'Called the owner: typing mistake' })
      ).status,
    ).toBe(200);
    expect((await ana.get(`/api/my/farms/${anaFarmId}`)).body.livestock[0].count).toBe(26);
    // A new kind of livestock, large enough to be reviewed, then accepted.
    const goats = await ana
      .post('/api/my/population')
      .send({ farmId: anaFarmId, species: 'Goat', reason: 'PURCHASE', quantity: 12 });
    expect(goats.body.status).toBe('PENDING');
    // The owner may cancel her own pending update.
    expect((await ana.post(`/api/my/population/${goats.body.id}/cancel`)).status).toBe(200);
    const goats2 = await ana
      .post('/api/my/population')
      .send({ farmId: anaFarmId, species: 'Goat', reason: 'PURCHASE', quantity: 12 });
    expect(
      (await admin.post(`/api/review/population/${goats2.body.id}`).send({ decision: 'ACCEPT' })).status,
    ).toBe(400);
    expect(
      (
        await admin
          .post(`/api/review/population/${goats2.body.id}`)
          .send({ decision: 'ACCEPT', reason: 'Saw the receipt for 12 goats' })
      ).status,
    ).toBe(200);
    const live = (await ana.get(`/api/my/farms/${anaFarmId}`)).body.livestock;
    expect(live).toEqual(expect.arrayContaining([expect.objectContaining({ species: 'Goat', count: 12 })]));
    // Every change keeps who sent it and who accepted it.
    const hist = (await ana.get('/api/my/population')).body;
    expect(hist.find((h: { id: number }) => h.id === goats2.body.id)).toMatchObject({
      status: 'ACCEPTED',
      decidedBy: 'Dr. Liza Admin',
    });
  });

  it('an owner reports sick animals; the office asks, validates and the owner follows the case', async () => {
    const bad = await ana
      .post('/api/my/reports')
      .send({ farmId: anaFarmId, species: 'Pig', symptoms: 'Fever', affected: 2, deaths: 5 });
    expect(bad.body.fieldErrors.deaths).toBeDefined();
    const sent = await ana.post('/api/my/reports').send({
      farmId: anaFarmId,
      species: 'Pig',
      signs: ['FEVER', 'SKIN_REDNESS'],
      symptoms: 'Three pigs stopped eating and have red skin.',
      affected: 3,
      deaths: 1,
      lat: 13.6554,
      lng: 123.2244,
      gpsAccuracy: 8,
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body).toMatchObject({
      status: 'REPORTED',
      locationSource: 'PHONE_GPS',
      code: expect.stringMatching(/^RPT-/),
    });
    // Sending the same thing again is refused.
    expect(
      (
        await ana
          .post('/api/my/reports')
          .send({ farmId: anaFarmId, species: 'Pig', symptoms: 'Again', affected: 3 })
      ).status,
    ).toBe(409);
    const id = sent.body.id;
    expect((await ana.get(`/api/my/reports/${id}`)).body).toMatchObject({
      stage: 'REPORTED',
      stageLabel: 'Reported',
    });
    expect((await ben.get(`/api/my/reports/${id}`)).status).toBe(404);

    const detail = (await admin.get(`/api/review/reports/${id}`)).body;
    expect(detail).toMatchObject({ recordedHead: 26, species: 'Pig' });
    expect(
      (await viewer.post(`/api/review/reports/${id}`).send({ decision: 'REJECT', message: 'x' })).status,
    ).toBe(403);
    expect((await admin.post(`/api/review/reports/${id}`).send({ decision: 'REQUEST_INFO' })).status).toBe(
      400,
    );
    await admin
      .post(`/api/review/reports/${id}`)
      .send({ decision: 'REQUEST_INFO', message: 'When did the first pig get sick?' });
    const asked = (await ana.get(`/api/my/reports/${id}`)).body;
    expect(asked.stage).toBe('INFO_REQUESTED');
    // Staff are shown as the office, never by name.
    expect(asked.report.messages[0]).toMatchObject({ fromOwner: false, by: 'City Veterinary Office' });
    expect((await ana.post(`/api/my/reports/${id}/reply`).send({ text: 'Two days ago.' })).status).toBe(201);
    expect(
      (await admin.get('/api/review/reports')).body.find((r: { id: number }) => r.id === id).status,
    ).toBe('REPORTED');

    expect((await admin.post(`/api/review/reports/${id}`).send({ decision: 'VALIDATE' })).status).toBe(400);
    // Validating needs the checklist, an assessment and the date of the field visit.
    const err = (
      await admin
        .post(`/api/review/reports/${id}`)
        .send({ decision: 'VALIDATE', disease: 'African Swine Fever (ASF)' })
    ).body.fieldErrors;
    expect(Object.keys(err)).toEqual(expect.arrayContaining(['assessment', 'visitDate']));
    const ok = await admin.post(`/api/review/reports/${id}`).send({
      decision: 'VALIDATE',
      disease: 'African Swine Fever (ASF)',
      assessment: 'Fever and deaths in 3 pigs; ASF cannot be ruled out.',
      visitDate: isoDate(),
      checklist: ['PHOTOS_SEEN', 'FARM_CONFIRMED', 'NOT_DUPLICATE'],
    });
    expect(ok.status).toBe(200);
    caseId = ok.body.caseId;
    const c = (await admin.get(`/api/cases/${caseId}`)).body;
    expect(c.case).toMatchObject({ disease: 'African Swine Fever (ASF)', affected: 3, deaths: 1 });
    expect(c).toMatchObject({ stage: 'UNDER_INVESTIGATION', ownerReport: { id } });
    expect((await ana.get(`/api/my/reports/${id}`)).body).toMatchObject({
      stage: 'UNDER_INVESTIGATION',
      case: { code: ok.body.caseCode },
    });
    // It cannot be decided twice.
    expect(
      (await admin.post(`/api/review/reports/${id}`).send({ decision: 'REJECT', message: 'no' })).status,
    ).toBe(400);

    // The laboratory result: the owner is told and sees it, but none of the staff notes.
    const lab = await admin.post(`/api/cases/${caseId}/labs`).send({
      sampleId: 'OWN-APP-1',
      sampleType: 'Whole blood',
      testMethod: 'PCR',
      collectedAt: isoDate(),
      sentAt: isoDate(),
      result: 'POSITIVE',
      resultDate: isoDate(),
      remarks: 'INTERNAL NOTE',
    });
    expect(lab.status).toBe(201);
    const seen = (await ana.get(`/api/my/reports/${id}`)).body;
    expect(seen.stage).toBe('CONFIRMED');
    expect(seen.case.labResults[0]).toMatchObject({ sampleId: 'OWN-APP-1', result: 'POSITIVE' });
    expect(JSON.stringify(seen)).not.toContain('INTERNAL NOTE');
    const titles = (await ana.get('/api/my/notifications')).body.map((n: { title: string }) => n.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/confirmed at Reyes Piggery/),
        expect.stringMatching(/accepted: under investigation/),
      ]),
    );
  });

  it('a monitoring zone alerts the owners inside it, with their distance, and can be widened and lifted', async () => {
    // Only for a confirmed case, and only by a reviewer.
    expect((await admin.post('/api/zones').send({ caseId: 6, radiusM: 1000 })).status).toBe(400);
    expect((await viewer.post('/api/zones').send({ caseId, radiusM: 100 })).status).toBe(403);
    // One step: the positive result already set the zone (default radius) and alerted Ben (~300 m).
    const auto = (await admin.get('/api/zones')).body.find(
      (x: { caseId: number; status: string }) => x.caseId === caseId && x.status === 'ACTIVE',
    );
    expect(auto).toMatchObject({ radiusM: 1000, createdBy: expect.stringMatching(/automatic/) });
    const z = { body: auto as { id: number } };
    expect((await ben.get('/api/my/alerts')).body[0]).toMatchObject({ radiusM: 1000 });
    expect((await admin.post('/api/zones').send({ caseId, radiusM: 500 })).body.error).toMatch(
      /already has an active monitoring zone/,
    );
    // Narrowed to 100 m, Ben's farm is outside; widened to 500 m it is inside again (no second alert).
    await admin
      .patch(`/api/zones/${z.body.id}`)
      .send({ radiusM: 100, guidance: 'Do not move pigs out of the area.' });
    expect((await ben.get('/api/my/alerts')).body).toEqual([]);
    const wider = await admin
      .patch(`/api/zones/${z.body.id}`)
      .send({ radiusM: 500, guidance: 'Do not move pigs out of the area.' });
    expect(wider.body.newlyNotified).toBe(0);
    const alerts = (await ben.get('/api/my/alerts')).body;
    expect(alerts[0]).toMatchObject({
      disease: 'African Swine Fever (ASF)',
      farmId: benFarmId,
      radiusM: 500,
    });
    expect(alerts[0].distance).toBeGreaterThan(200);
    const note = (await ben.get('/api/my/notifications')).body.find(
      (n: { type: string }) => n.type === 'ALERT',
    );
    expect(note.body).toMatch(/about \d+ m from your farm Cruz Farm/);
    // The alert never names the reporting owner or farm.
    expect(JSON.stringify([alerts, note])).not.toMatch(/Ana Reyes|Reyes Piggery/);
    // Widening again does not send a second alert to the same farm.
    await admin.patch(`/api/zones/${z.body.id}`).send({ radiusM: 1000 });
    expect(
      (await ben.get('/api/my/notifications')).body.filter((n: { type: string }) => n.type === 'ALERT'),
    ).toHaveLength(1);
    const view = (await admin.get(`/api/zones/${z.body.id}`)).body;
    expect(view.rows.find((r: { farmId: number }) => r.farmId === benFarmId)).toMatchObject({
      hasApp: true,
      owner: 'Ben Cruz',
    });
    expect((await admin.get(`/api/cases/${caseId}`)).body.zone).toMatchObject({
      status: 'ACTIVE',
      radiusM: 1000,
    });

    expect((await admin.post(`/api/zones/${z.body.id}/lift`).send({})).status).toBe(400);
    expect(
      (await admin.post(`/api/zones/${z.body.id}/lift`).send({ reason: 'No new cases for 40 days' })).body
        .status,
    ).toBe('LIFTED');
    expect((await ben.get('/api/my/alerts')).body).toEqual([]);
    expect((await admin.patch(`/api/zones/${z.body.id}`).send({ radiusM: 3000 })).status).toBe(400);
  });

  it('vaccination activities, sign-ups, owner-submitted records and service requests', async () => {
    const tomorrow = isoDate(new Date(Date.now() + 86_400_000));
    expect(
      (
        await admin
          .post('/api/activities')
          .send({ title: 'Hog cholera vaccination', species: 'Pig', barangay: 'Pacol', date: '2020-01-01' })
      ).status,
    ).toBe(400);
    const a = await admin.post('/api/activities').send({
      title: 'Hog cholera vaccination',
      vaccine: 'Hog cholera vaccine',
      species: 'Pig',
      barangay: 'Pacol',
      date: isoDate(),
      time: '8:00 AM',
      venue: 'Pacol covered court',
    });
    expect(a.status).toBe(201);
    expect(a.body.notified).toBeGreaterThanOrEqual(2);
    const v = (await ana.get('/api/my/vaccination')).body;
    expect(v.activities.find((x: { id: number }) => x.id === a.body.id)).toMatchObject({
      title: 'Hog cholera vaccination',
      status: 'SCHEDULED',
    });
    expect(
      (
        await ana
          .post(`/api/activities/${a.body.id}/signup`)
          .send({ farmId: anaFarmId, species: 'Goat', heads: 2 })
      ).status,
    ).toBe(403);
    expect(
      (
        await ana
          .post(`/api/my/activities/${a.body.id}/signup`)
          .send({ farmId: anaFarmId, species: 'Goat', heads: 2 })
      ).body.fieldErrors.species[0],
    ).toMatch(/for Pig/);
    expect(
      (
        await ana
          .post(`/api/my/activities/${a.body.id}/signup`)
          .send({ farmId: anaFarmId, species: 'Pig', heads: 500 })
      ).body.fieldErrors.heads[0],
    ).toMatch(/only 26 Pig/);
    const s = await ana
      .post(`/api/my/activities/${a.body.id}/signup`)
      .send({ farmId: anaFarmId, species: 'Pig', heads: 10 });
    expect(s.status).toBe(201);
    // Moving it tells the owners; attendance puts the vaccination on the farm's official record.
    const moved = await admin.patch(`/api/activities/${a.body.id}`).send({
      title: 'Hog cholera vaccination',
      vaccine: 'Hog cholera vaccine',
      species: 'Pig',
      barangay: 'Pacol',
      date: isoDate(),
      time: '1:00 PM',
      venue: 'Pacol covered court',
    });
    expect(moved.body.notified).toBeGreaterThanOrEqual(1);
    expect(
      (await admin.post(`/api/activities/signups/${s.body.id}/status`).send({ status: 'ATTENDED' })).status,
    ).toBe(200);
    const rec = (await ana.get('/api/my/vaccination')).body.records;
    expect(rec[0]).toMatchObject({ product: 'Hog cholera vaccine', heads: 10, species: 'Pig' });
    expect(
      (await admin.post(`/api/activities/${a.body.id}/status`).send({ status: 'CANCELLED' })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/api/activities/${a.body.id}/status`).send({ status: 'COMPLETED' })).body.status,
    ).toBe('COMPLETED');
    expect(
      (await admin.post(`/api/activities/${a.body.id}/status`).send({ status: 'SCHEDULED' })).status,
    ).toBe(400);

    // The day before an activity the owner signed up for, a reminder is waiting (once).
    const b = await admin
      .post('/api/activities')
      .send({ title: 'Deworming day', species: 'All', barangay: 'ALL', date: tomorrow });
    await ben
      .post(`/api/my/activities/${b.body.id}/signup`)
      .send({ farmId: benFarmId, species: 'Pig', heads: 4 });
    await ben.get('/api/my/home');
    await ben.get('/api/my/home');
    const reminders = (await ben.get('/api/my/notifications')).body.filter((n: { title: string }) =>
      /Reminder: Deworming day/.test(n.title),
    );
    expect(reminders).toHaveLength(1);
    const cancelled = await admin
      .post(`/api/activities/${b.body.id}/status`)
      .send({ status: 'CANCELLED', reason: 'Typhoon signal' });
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Typhoon signal' });

    // A private veterinarian's vaccination, sent by the owner and verified by the office.
    const own = await ana.post('/api/my/vaccinations').send({
      farmId: anaFarmId,
      species: 'Goat',
      vaccine: 'Anthrax spore vaccine',
      date: isoDate(),
      heads: 5,
      givenBy: 'Dr. Private Vet',
    });
    expect(own.status).toBe(201);
    expect(
      (await admin.post(`/api/review/vaccinations/${own.body.id}`).send({ decision: 'REJECT' })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/api/review/vaccinations/${own.body.id}`).send({ decision: 'VERIFY' })).status,
    ).toBe(400);
    expect(
      (
        await admin
          .post(`/api/review/vaccinations/${own.body.id}`)
          .send({ decision: 'VERIFY', checklist: ['PROOF_OK', 'DETAILS_MATCH', 'HEADS_OK'] })
      ).status,
    ).toBe(200);
    expect((await ana.get('/api/my/vaccination')).body.submitted[0]).toMatchObject({ status: 'VERIFIED' });

    const rq = await ana
      .post('/api/my/service-requests')
      .send({ farmId: anaFarmId, serviceType: 'DEWORMING', note: 'Goats are thin' });
    expect(rq.body.code).toMatch(/^SRQ-/);
    expect(
      (await admin.post(`/api/review/service-requests/${rq.body.id}`).send({ status: 'SCHEDULED' })).status,
    ).toBe(400);
    expect(
      (
        await viewer
          .post(`/api/review/service-requests/${rq.body.id}`)
          .send({ status: 'SCHEDULED', scheduledDate: tomorrow })
      ).status,
    ).toBe(200);
    expect((await ana.get('/api/my/vaccination')).body.requests[0]).toMatchObject({
      status: 'SCHEDULED',
      scheduledDate: tomorrow,
    });
    // A request is scheduled before it can be marked done.
    const rq2 = await ana
      .post('/api/my/service-requests')
      .send({ farmId: anaFarmId, serviceType: 'DEWORMING' });
    expect(
      (await admin.post(`/api/review/service-requests/${rq2.body.id}`).send({ status: 'DONE' })).body.error,
    ).toMatch(/Schedule the visit first/);
  });

  it('announcements reach their audience, can be muted, and are withdrawn instead of deleted', async () => {
    expect(
      (await viewer.post('/api/announcements').send({ title: 'x', body: 'y', audience: 'ALL' })).status,
    ).toBe(403);
    expect(
      (await admin.post('/api/announcements').send({ title: 'x', body: 'y', audience: 'BARANGAY' })).status,
    ).toBe(400);
    // Ben turns announcements off; alerts and his own records cannot be turned off.
    expect((await ben.put('/api/my/settings').send({ muted: ['ALERT'] })).status).toBe(400);
    expect((await ben.put('/api/my/settings').send({ muted: ['ANNOUNCEMENT'] })).body.muted).toEqual([
      'ANNOUNCEMENT',
    ]);
    const a = await admin.post('/api/announcements').send({
      title: 'ASF advisory',
      body: 'Do not feed swill to pigs.',
      audience: 'BARANGAY',
      barangay: 'Pacol',
    });
    expect(a.status).toBe(201);
    expect(a.body.code).toMatch(/^ANN-/);
    expect(a.body.recipients).toBeGreaterThanOrEqual(1);
    expect((await ana.get('/api/my/announcements')).body[0]).toMatchObject({ title: 'ASF advisory' });
    const benNotes = (await ben.get('/api/my/notifications')).body;
    expect(benNotes.some((n: { title: string }) => n.title === 'ASF advisory')).toBe(false);
    // Reading is tracked.
    await ana.post('/api/my/notifications/read').send({});
    expect((await ana.get('/api/my/home')).body.unread).toBe(0);
    expect(
      (await admin.get('/api/announcements')).body.find((x: { id: number }) => x.id === a.body.id).read,
    ).toBeGreaterThanOrEqual(1);
    expect((await admin.delete(`/api/announcements/${a.body.id}`)).status).toBe(404);
    expect(
      (await admin.post(`/api/announcements/${a.body.id}/withdraw`).send({ reason: 'Wrong barangay' })).body
        .status,
    ).toBe('WITHDRAWN');
    expect(
      (await ana.get('/api/my/announcements')).body.some((x: { id: number }) => x.id === a.body.id),
    ).toBe(false);
  });

  it('owners and the office message each other; the thread also shows their transactions', async () => {
    expect((await ana.post('/api/my/messages').send({ text: '  ' })).status).toBe(400);
    expect((await ana.post('/api/my/messages').send({ text: 'When is the next deworming?' })).status).toBe(
      201,
    );
    expect((await admin.get('/api/messages/summary')).body.unread).toBeGreaterThanOrEqual(1);
    const list = (await admin.get('/api/messages')).body;
    expect(list[0]).toMatchObject({ ownerId: anaOwnerId, unread: 1 });
    // Any staff member can read and reply; opening the thread marks it read.
    const t = (await viewer.get(`/api/messages/${anaOwnerId}`)).body;
    expect(
      t.items.some(
        (i: { kind: string; title?: string }) =>
          i.kind === 'event' && /Farm registration sent/.test(i.title ?? ''),
      ),
    ).toBe(true);
    expect((await admin.get('/api/messages/summary')).body.unread).toBe(0);
    expect(
      (await viewer.post(`/api/messages/${anaOwnerId}`).send({ text: 'Next Tuesday at the barangay hall.' }))
        .status,
    ).toBe(201);
    expect((await ana.get('/api/my/home')).body.unread).toBeGreaterThanOrEqual(1);
    const mine = (await ana.get('/api/my/messages')).body.items;
    const reply = mine.filter((i: { kind: string }) => i.kind === 'message').at(-1);
    // The owner sees the office, not the staff member's name.
    expect(reply).toMatchObject({
      fromOwner: false,
      by: 'City Veterinary Office',
      text: 'Next Tuesday at the barangay hall.',
    });
    expect((await ana.get('/api/my/home')).body.unread).toBe(0);
    // Owners cannot open the staff side, and see only their own thread.
    expect((await ana.get('/api/messages')).status).toBe(403);
    expect(JSON.stringify((await ben.get('/api/my/messages')).body)).not.toMatch(/deworming/);
  });

  it('a registration that is not accepted closes the app, with the reason and the office contact', async () => {
    const carl = fresh();
    const c = await signUp(carl, reg({ fullName: 'Carl Diaz', phone: '09175550909' }));
    expect(
      (
        await admin
          .post(`/api/review/owners/${c.body.user.ownerId}`)
          .send({ decision: 'INACTIVE', reason: 'Lives outside Naga City' })
      ).status,
    ).toBe(200);
    const home = (await carl.get('/api/my/home')).body;
    expect(home.owner).toMatchObject({ status: 'INACTIVE', returnReason: 'Lives outside Naga City' });
    expect(home.office.name).toBeTruthy();
    // Nothing else can be sent.
    expect((await carl.post('/api/my/farms').send(farm({ name: 'Diaz Farm' }))).status).toBe(403);
    expect((await carl.get('/api/my/reports')).status).toBe(403);
  });

  it('staff give an existing owner a login; the farm summary and the public page show no private data', async () => {
    const existing = await prisma.owner.findFirst({ where: { status: 'ACTIVE', account: null } });
    const made = await admin.post(`/api/review/accounts/${existing!.id}`).send({ phone: '09175550303' });
    expect(made.status).toBe(201);
    const o = fresh();
    const first = await o
      .post('/api/auth/login')
      .send({ email: '09175550303', password: made.body.temporaryPassword });
    expect(first.body.user).toMatchObject({ role: 'OWNER', mustChangePassword: true, ownerId: existing!.id });
    expect((await o.get('/api/my/home')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await o
      .post('/api/auth/change-password')
      .send({ current: made.body.temporaryPassword, password: 'Baka#2026a', confirm: 'Baka#2026a' });
    expect((await o.get('/api/my/home')).body.owner.fullName).toBe(existing!.fullName);
    expect(
      (await admin.post(`/api/review/accounts/${existing!.id}`).send({ phone: '09175550304' })).body.error,
    ).toMatch(/already has a login/);

    const sum = (await ana.get('/api/my/summary?log=1')).body;
    expect(sum.owner.fullName).toBe('Ana Reyes');
    expect(sum.farms.map((f: { name: string }) => f.name)).toEqual(['Reyes Piggery']);
    expect((await admin.get('/api/audit?action=EXPORT&q=Ana')).body.rows[0].note).toMatch(
      /Farm summary of Ana Reyes/,
    );

    // Public: no sign-in, totals and barangay-level figures only.
    const pub = await request(app).get('/api/public/overview');
    expect(pub.status).toBe(200);
    expect(pub.body.totals.livestock).toBeGreaterThan(0);
    expect(
      pub.body.barangays.find((b: { barangay: string }) => b.barangay === 'Pacol').confirmedOpen,
    ).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(pub.body);
    // Confirmed cases are shown where they are, but never with the owner or the farm.
    expect(text).not.toMatch(/Ana Reyes|Reyes Piggery|0917|ownerId|farmId/);
    expect(pub.body.cases.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(pub.body.cases[0]).sort()).toEqual(
      ['barangay', 'code', 'disease', 'lat', 'lng', 'reportedAt', 'species'].sort(),
    );
    // Everything an owner does is in the audit trail as coming from the owner app.
    const log = (await admin.get('/api/audit?table=PopulationRequest')).body;
    expect(
      log.rows.some(
        (r: { source: string; byName: string }) => r.source === 'owner' && r.byName === 'Ana Reyes',
      ),
    ).toBe(true);
  });
});
