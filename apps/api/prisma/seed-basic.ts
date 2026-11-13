/**
 * BASIC demo data: ONE complete example for each page and process, nothing extra.
 *
 *   Owners .............. 3 (Juan Dela Cruz, Ramon Mendoza, Elena Ramos)
 *   Farms ............... 3 (a backyard piggery, a cattle & carabao farm with pasture, a commercial piggery)
 *   Population .......... 5 groups, each with 3 months of head counts and an age/sex breakdown
 *   Tagged animals ...... 2 (a cow and a carabao: ear tag, cowlick, purpose, ownership certificate)
 *   Ownership record .... 1 (the carabao sold from Juan to Ramon)
 *   Stray / violation ... 1 (the carabao on the road: impounded, released, fine paid, closed)
 *   Disease case ........ 1 (ASF, Active: report, site visit, 2 lab samples, positive, all 7 ASF steps,
 *                            head count updated, monitoring of the farm within 1 km) — next step: close it
 *   Lab submission ...... 1 (surveillance batch of 3 samples from the farm within 1 km, negative by email)
 *   Services ............ 6 (one each: vaccination, deworming, check-up, treatment, insemination,
 *                            pregnancy diagnosis)
 *   Farm visits ......... 2 (a deworming visit and a disease-monitoring visit)
 *   Insurance (PCIC) .... 1 (subsidized through RSBSA, with the insured ear tag)
 *   Settings ............ office address/contact/email and this year's vaccination target
 *
 * All dates are counted back from the day you seed, so seed again the day before the demo.
 * Run with: pnpm db:seed:basic   (WIPES the database, then loads the data above)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { addMonths, code, isoDate, isoMonth } from '@livestock/shared';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { adapterFromUrl } from '../src/lib/adapter.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? 'mysql://livestock:livestock@localhost:3306/livestock';
const prisma = new PrismaClient({ adapter: adapterFromUrl(DATABASE_URL) });

const D = (s: string) => new Date(`${s}T00:00:00.000Z`); // date column
const DT = (s: string) => new Date(s); // local date and time
/** YYYY-MM-DD n days before today (negative n = days ahead). */
const ago = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
};
const ahead = (n: number) => ago(-n);

const LIZA = 'Dr. Liza Admin';
const MARK = 'Dr. Mark Inspector';
const JOY = 'Dr. Joy Inspector';
const LAB = 'RADDL Region V, San Agustin, Pili, Camarines Sur';
const ASF_TEST = 'PCR – African Swine Fever (ASF)';

/**
 * Timeline of the ASF case, in days ago. It starts inside this month when the month is old enough,
 * so the case also shows on this month's report (8 to 14 days ago).
 */
const CASE_REPORTED = Math.max(8, Math.min(14, new Date().getDate() - 1)); // report, site visit, samples
const CASE_SENT = CASE_REPORTED - 1; // samples sent to RADDL
const CASE_RESULT = CASE_REPORTED - 3; // positive result by email (1–2 days after arriving)
const CASE_CULL = CASE_REPORTED - 4; // remaining pigs euthanized and buried on the farm
const MONITOR = CASE_REPORTED - 5; // visit to the farm within 1 km + surveillance samples
const TRANSFER = 45; // carabao sold from Juan to Ramon
const STRAY = 25; // the carabao found on the road
/** Deworming visit: a few days ago but inside this month, so it counts on the dashboard and monthly report. */
const RECENT = Math.max(0, Math.min(5, new Date().getDate() - 1));

async function wipe() {
  await prisma.activityLog.deleteMany();
  await prisma.caseStatusHistory.deleteMany();
  await prisma.investigation.deleteMany();
  await prisma.labRecord.deleteMany();
  await prisma.labSubmission.deleteMany();
  await prisma.responseActivity.deleteMany();
  await prisma.farmVisit.deleteMany();
  await prisma.diseaseCase.deleteMany();
  await prisma.vaccination.deleteMany();
  await prisma.ownershipTransfer.deleteMany();
  await prisma.strayIncident.deleteMany();
  await prisma.pcicPolicy.deleteMany();
  await prisma.animal.deleteMany();
  await prisma.populationUpdate.deleteMany();
  await prisma.populationGroup.deleteMany();
  await prisma.farm.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  for (const t of [
    'ActivityLog',
    'CaseStatusHistory',
    'Investigation',
    'LabRecord',
    'LabSubmission',
    'ResponseActivity',
    'DiseaseCase',
    'FarmVisit',
    'Vaccination',
    'OwnershipTransfer',
    'StrayIncident',
    'Animal',
    'PopulationUpdate',
    'PopulationGroup',
    'Farm',
    'PcicPolicy',
    'Owner',
    'RefreshToken',
    'User',
  ]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${t}\` AUTO_INCREMENT = 1`);
  }
}

const log = (entity: string, entityId: number, action: string, summary: string, byName: string, at: string) =>
  prisma.activityLog.create({ data: { entity, entityId, action, summary, byName, createdAt: DT(at) } });

async function main() {
  console.log('Seeding BASIC demo data (one example per page and process)…');
  await wipe();

  /* ---------------- login accounts (password: Livestock@2026) ---------------- */
  const hash = await bcrypt.hash('Livestock@2026', 10);
  const accounts = [
    { name: LIZA, email: 'admin@nagacityvet.gov.ph', role: 'ADMIN' as const, title: 'Administrator' },
    { name: MARK, email: 'mark@nagacityvet.gov.ph', role: 'STAFF' as const, title: 'Veterinary Inspector' },
    { name: JOY, email: 'joy@nagacityvet.gov.ph', role: 'STAFF' as const, title: 'Veterinary Inspector' },
    {
      name: 'Records Viewer',
      email: 'viewer@nagacityvet.gov.ph',
      role: 'READONLY' as const,
      title: 'Read-only',
    },
  ];
  const users = [];
  for (const u of accounts) users.push(await prisma.user.create({ data: { ...u, passwordHash: hash } }));
  const mark = users[1];

  /* ---------------- owners ---------------- */
  const registered = DT(`${ago(100)}T09:00:00`);
  const juan = await prisma.owner.create({
    data: {
      code: code('OWN', 1),
      fullName: 'Juan Dela Cruz',
      barangay: 'Cararayan',
      zone: 'Zone 1',
      street: '12 Rizal St.',
      contact: '0917-555-1000',
      rsbsa: '05-17-24-100-000',
      source: 'DA_LIST',
      remarks: 'President, Cararayan Hog Raisers Association',
      registeredAt: registered,
    },
  });
  const ramon = await prisma.owner.create({
    data: {
      code: code('OWN', 2),
      fullName: 'Ramon Mendoza',
      barangay: 'Carolina',
      zone: 'Zone 7',
      street: '48 Panicuason Road',
      contact: '0917-555-1037',
      rsbsa: '05-17-24-106-006',
      source: 'DA_LIST',
      remarks: 'Tends the communal pasture in upper Carolina',
      registeredAt: registered,
    },
  });
  const elena = await prisma.owner.create({
    data: {
      code: code('OWN', 3),
      fullName: 'Elena Ramos',
      barangay: 'Cararayan',
      zone: 'Zone 2',
      street: '5 Mabini St.',
      contact: '0917-555-1074',
      rsbsa: '05-17-24-100-014',
      source: 'FARM_VISIT',
      remarks: 'Registered during a farm visit',
      registeredAt: registered,
    },
  });

  /* ---------------- farms ---------------- */
  const farmData = (o: typeof juan) => ({
    ownerId: o.id,
    barangay: o.barangay,
    zone: o.zone,
    address: `${o.street}, ${o.zone}, Brgy. ${o.barangay}, Naga City`,
    createdAt: DT(`${ago(99)}T08:00:00`),
  });
  const juanFarm = await prisma.farm.create({
    data: {
      ...farmData(juan),
      code: code('FRM', 1),
      name: 'Dela Cruz Backyard Piggery',
      type: 'backyard',
      lat: 13.638,
      lng: 123.238,
      source: 'DA_LIST',
      remarks:
        'ASF confirmed (CASE-0001). Pigs euthanized and buried on the farm. No restocking until cleared.',
    },
  });
  const ramonFarm = await prisma.farm.create({
    data: {
      ...farmData(ramon),
      code: code('FRM', 2),
      name: 'Mendoza Cattle & Carabao Farm',
      type: 'backyard',
      lat: 13.6672,
      lng: 123.2768,
      pastureArea: 4.5,
      pastureLocation: 'Mt. Isarog foothills grazing area, upper Carolina',
      pastureLat: 13.6735,
      pastureLng: 123.2851,
      source: 'DA_LIST',
    },
  });
  const elenaFarm = await prisma.farm.create({
    data: {
      ...farmData(elena),
      code: code('FRM', 3),
      name: 'Ramos Commercial Piggery',
      type: 'commercial',
      lat: 13.642,
      lng: 123.241,
      source: 'FARM_VISIT',
      remarks: 'About 550 m from the ASF case: inside the 1 km monitoring radius.',
    },
  });

  /* ---------------- population groups with 3 months of head counts ---------------- */
  const now = isoMonth();
  const months = [addMonths(now, -2), addMonths(now, -1), now];
  let groupNo = 0;
  /** Creates a group and one verified count per month; `changes` are dated events that move the count. */
  const group = async (
    farmId: number,
    g: {
      species: string;
      breed: string;
      start: number;
      purpose?: string;
      sex?: string;
      lifeStage?: string;
      healthStatus?: string;
      remarks?: string;
      breakdown?: Record<string, number>;
      changes?: { on: string; delta: number; reason: string }[];
    },
  ) => {
    const changes = g.changes ?? [];
    const final = g.start + changes.reduce((s, c) => s + c.delta, 0);
    const created = await prisma.populationGroup.create({
      data: {
        code: code('GRP', ++groupNo),
        farmId,
        species: g.species,
        breed: g.breed,
        sex: g.sex ?? 'Mixed',
        lifeStage: g.lifeStage ?? 'Mixed',
        count: final,
        healthStatus: g.healthStatus ?? 'Healthy',
        purpose: g.purpose ?? null,
        breakdown: g.breakdown ?? undefined,
        remarks: g.remarks ?? null,
        lastVerified: now,
        createdAt: DT(`${ago(99)}T08:00:00`),
      },
    });
    let prev: number | null = null;
    let count = g.start;
    for (const [k, m] of months.entries()) {
      const inMonth = k === 0 ? [] : changes.filter((c) => c.on.slice(0, 7) === m);
      // Events before the first month are already in `start`.
      for (const c of inMonth) count += c.delta;
      const change = count - (prev ?? 0);
      await prisma.populationUpdate.create({
        data: {
          groupId: created.id,
          month: m,
          count,
          previous: prev,
          change,
          reason:
            k === 0
              ? 'Initial count'
              : inMonth.length
                ? inMonth.map((c) => c.reason).join('; ')
                : 'No change',
          createdBy: k % 2 ? JOY : MARK,
          createdAt: DT(`${k === 2 ? ago(0) : `${m}-05`}T07:00:00`),
        },
      });
      prev = count;
    }
    return created;
  };
  // Changes are shown from the second month on; an older event is dated to the start of that month.
  const inRange = (d: string) => (d.slice(0, 7) < months[1] ? `${months[1]}-03` : d);

  await group(juanFarm.id, {
    species: 'Swine',
    breed: 'Native × Large White',
    start: 12,
    healthStatus: 'Quarantined',
    remarks: 'Depopulated after ASF (CASE-0001); no restocking until cleared by the City Vet',
    changes: [
      {
        on: inRange(ago(CASE_CULL)),
        delta: -12,
        reason: 'ASF (CASE-0001): 3 died, 9 euthanized and buried on the farm',
      },
    ],
  });
  await group(juanFarm.id, {
    species: 'Carabao',
    breed: 'Philippine Carabao',
    start: 2,
    purpose: 'DRAFT',
    breakdown: { caracow: 1 },
    remarks: 'Used for plowing',
    changes: [{ on: inRange(ago(TRANSFER)), delta: -1, reason: 'Sold 1 to Ramon Mendoza (TRF-0001)' }],
  });
  const ramonCattle = await group(ramonFarm.id, {
    species: 'Cattle',
    breed: 'Brahman',
    start: 6,
    purpose: 'BREEDING',
    breakdown: { calf: 1, heifer: 1, cow: 4, bull: 1 },
    remarks: 'Breeding herd; grazes on the foothill pasture',
    changes: [{ on: inRange(`${months[1]}-12`), delta: 1, reason: 'births +1 (calf)' }],
  });
  const ramonCarabao = await group(ramonFarm.id, {
    species: 'Carabao',
    breed: 'Philippine Carabao',
    start: 3,
    purpose: 'DRAFT',
    breakdown: { caracow: 2, carabull: 2 },
    changes: [{ on: inRange(ago(TRANSFER)), delta: 1, reason: 'Bought 1 from Juan Dela Cruz (TRF-0001)' }],
  });
  const elenaSwine = await group(elenaFarm.id, {
    species: 'Swine',
    breed: 'Large White',
    start: 52,
    breakdown: { piglet: 8, weaner: 12, grower: 30, gilt: 4, sow: 5, boar: 1 },
    remarks: 'Inside the 1 km radius of CASE-0001: checked and sampled, all negative',
    changes: [{ on: `${months[1]}-20`, delta: 8, reason: 'births +8 (one sow farrowed)' }],
  });

  /* ---------------- tagged animals ---------------- */
  const cow = await prisma.animal.create({
    data: {
      code: 'NC-C-0001',
      earTag: 'ET-2401',
      groupId: ramonCattle.id,
      species: 'Cattle',
      breed: 'Brahman',
      sex: 'Female',
      estimatedAge: '4 yrs',
      lifeStage: 'adult',
      markings: 'Dark brown, notched left ear',
      cowlick: 'Cowlick on right shoulder',
      purpose: 'BREEDING',
      colcNo: 'COLC-2026-0311',
      colcDate: D(ago(95)),
      health: 'healthy',
      remarks: 'Breeder cow; ear-tagged when insured with PCIC',
      createdAt: DT(`${ago(95)}T09:00:00`),
    },
  });
  const carabao = await prisma.animal.create({
    data: {
      code: 'NC-K-0002',
      earTag: 'ET-2402',
      groupId: ramonCarabao.id, // now on Ramon's farm (see the ownership record)
      species: 'Carabao',
      breed: 'Philippine Carabao',
      sex: 'Male',
      estimatedAge: '6 yrs',
      lifeStage: 'adult',
      markings: 'Black, broken right horn tip',
      cowlick: 'Whorl on left flank',
      purpose: 'DRAFT',
      colcNo: 'COLC-2026-0402',
      colcDate: D(ago(TRANSFER)),
      health: 'healthy',
      remarks: 'Bought from Juan Dela Cruz; new ownership certificate issued to Ramon Mendoza',
      createdAt: DT(`${ago(95)}T09:30:00`),
    },
  });
  await log('animal', cow.id, 'registered', 'Registered with ear tag ET-2401', MARK, `${ago(95)}T09:00:00`);
  await log(
    'animal',
    carabao.id,
    'registered',
    'Registered with ear tag ET-2402',
    MARK,
    `${ago(95)}T09:30:00`,
  );

  /* ---------------- ownership record: the carabao sold from Juan to Ramon ---------------- */
  const trf = await prisma.ownershipTransfer.create({
    data: {
      code: code('TRF', 1),
      animalId: carabao.id,
      date: D(ago(TRANSFER)),
      fromOwnerId: juan.id,
      fromFarmId: juanFarm.id,
      toOwnerId: ramon.id,
      toFarmId: ramonFarm.id,
      type: 'TRANSFER',
      remarks: 'Sold for ₱65,000; deed of sale and new COLC presented',
      createdBy: MARK,
    },
  });
  await log(
    'animal',
    carabao.id,
    'transfer',
    `Transfer ${trf.code}: Juan Dela Cruz → Ramon Mendoza`,
    MARK,
    `${ago(TRANSFER)}T10:00:00`,
  );

  /* ---------------- stray / violation: the carabao on the road ---------------- */
  await prisma.strayIncident.create({
    data: {
      code: code('STR', 1),
      discoveredAt: DT(`${ago(STRAY)}T06:40:00`),
      species: 'Carabao',
      earTag: 'ET-2402',
      animalId: carabao.id,
      ownerId: ramon.id,
      barangay: 'Carolina',
      location: 'Carolina–Panicuason road, near the chapel',
      description: 'Carabao wandering on the road with a broken rope. Reported by a tricycle driver.',
      lat: 13.6655,
      lng: 123.2731,
      status: 'CLOSED',
      violations: 1,
      violationType: 'Animal on a public road or highway',
      fineAmount: 500,
      impoundedAt: D(ago(STRAY)),
      impoundPlace: 'City Vet impounding area, Carolina',
      releasedAt: D(ago(STRAY - 1)),
      releasedTo: 'Ramon Mendoza (owner)',
      finePaid: true,
      orNumber: 'OR-7712398',
      paidAt: D(ago(STRAY - 1)),
      remarks: 'First offense. Owner paid the fine, got the carabao back and replaced the rope.',
      createdBy: JOY,
      createdAt: DT(`${ago(STRAY)}T07:00:00`),
    },
  });

  /* ---------------- disease case: ASF, the whole process up to "Close the case" ---------------- */
  const day = (n: number, time = '09:00') => DT(`${ago(n)}T${time}:00`);
  const asf = await prisma.diseaseCase.create({
    data: {
      code: code('CASE', 1),
      ownerId: juan.id,
      farmId: juanFarm.id,
      barangay: juanFarm.barangay,
      zone: juanFarm.zone,
      species: 'Swine',
      disease: 'African Swine Fever (ASF)',
      affected: 5,
      deaths: 3,
      populationReconciled: 12, // 3 dead + 9 euthanized: already off the head count
      symptomsDate: D(ago(CASE_REPORTED + 2)),
      reportedAt: D(ago(CASE_REPORTED)),
      symptoms:
        'Three pigs died within two days. Others with high fever, not eating, reddish-purple ears and belly. ' +
        'Owner bought 2 weaners from a travelling trader two weeks before.',
      clinicalSigns: ['FEVER', 'NO_APPETITE', 'WEAKNESS', 'SKIN_REDNESS', 'SUDDEN_DEATH'],
      reportedBy: 'Juan Dela Cruz (owner)',
      assignedToId: mark.id,
      sampleInfo: 'Blood (live pig) and spleen, lymph node, liver (dead pig)',
      lat: juanFarm.lat,
      lng: juanFarm.lng,
      locationSource: 'Farm Coordinates',
      status: 'POSITIVE',
      remarks: 'All response steps done. Next: close the case after the 40-day quarantine.',
      createdAt: day(CASE_REPORTED, '08:30'),
    },
  });
  for (const [status, note, by, at] of [
    ['SUSPECTED', 'Case reported', MARK, day(CASE_REPORTED, '08:30')],
    ['SAMPLE_COLLECTED', 'Samples collected during the site visit', MARK, day(CASE_REPORTED, '15:00')],
    ['SENT_TO_LAB', 'Samples sent to RADDL', MARK, day(CASE_SENT, '10:00')],
    [
      'POSITIVE',
      'Laboratory confirmed: positive (result received by email)',
      LIZA,
      day(CASE_RESULT, '16:00'),
    ],
  ] as const)
    await prisma.caseStatusHistory.create({ data: { caseId: asf.id, status, note, byName: by, at } });
  await log(
    'case',
    asf.id,
    'reported',
    'Disease case CASE-0001 reported (African Swine Fever (ASF))',
    MARK,
    `${ago(CASE_REPORTED)}T08:30:00`,
  );
  await log(
    'case',
    asf.id,
    'status',
    'CASE-0001 confirmed POSITIVE — African Swine Fever (ASF)',
    LIZA,
    `${ago(CASE_RESULT)}T16:00:00`,
  );

  // Site visit (the two staff investigate themselves).
  await prisma.investigation.create({
    data: {
      caseId: asf.id,
      date: D(ago(CASE_REPORTED)),
      investigator: MARK,
      visitType: 'INITIAL',
      animalsExamined: 12,
      sickCount: 5,
      deadCount: 3,
      clinicalSigns: 'High fever (41–42 °C), reddish-purple blotches on ears and belly, not eating, weak.',
      biosecurity: 'No footbath at the gate; kitchen leftovers (swill) fed; pig traders enter the pens.',
      actionsTaken:
        'Blood taken from a sick pig; spleen, lymph node and liver from a dead pig. Owner told to stop selling or moving pigs.',
      samplesCollected: true,
      notes: 'Owner bought 2 weaners from a travelling trader two weeks ago.',
    },
  });

  // Laboratory samples: blood if the pig is alive, organs if it is dead.
  const caseSample = (s: { sampleId: string; sampleType: string; [k: string]: unknown }) => ({
    caseId: asf.id,
    farmId: juanFarm.id,
    species: 'Swine',
    testMethod: ASF_TEST,
    laboratory: LAB,
    submittedBy: MARK,
    sampleCount: 1,
    collectedAt: D(ago(CASE_REPORTED)),
    sentAt: D(ago(CASE_SENT)),
    labReference: 'R5-26-0912',
    result: 'POSITIVE' as const,
    resultDate: D(ago(CASE_RESULT)),
    receivedVia: 'EMAIL',
    remarks: 'ASF virus DNA detected.',
    ...s,
  });
  await prisma.labRecord.createMany({
    data: [
      caseSample({
        sampleId: 'NCV-26-0901',
        sampleType: 'Blood',
        condition: 'LIVE',
        animalAge: '4 m',
        animalSex: 'M',
      }),
      caseSample({
        sampleId: 'NCV-26-0902',
        sampleType: 'Tissue / Organs',
        organs: 'Spleen, Lymph node, Liver',
        condition: 'DEAD',
        hoursSinceDeath: 5,
        animalAge: '5 m',
        animalSex: 'F',
      }),
    ],
  });

  // The 7 ASF response steps, all done.
  const response = (r: {
    type: string;
    on: number;
    end?: number;
    status?: string;
    location?: string;
    personnel?: string;
    remarks: string;
    heads?: number;
    disposalMethod?: string;
  }) =>
    prisma.responseActivity.create({
      data: {
        caseId: asf.id,
        type: r.type,
        status: r.status ?? 'COMPLETED',
        date: D(ago(r.on)),
        endDate: r.end != null ? D(ago(r.end)) : null,
        location: r.location ?? null,
        personnel: r.personnel ?? MARK,
        remarks: r.remarks,
        heads: r.heads ?? null,
        disposalMethod: r.disposalMethod ?? null,
      },
    });
  await response({
    type: 'OWNER_NOTIFICATION',
    on: CASE_RESULT,
    remarks: 'Owner told of the positive result; neighbouring raisers within 1 km informed.',
  });
  await response({
    type: 'FARMER_EDUCATION',
    on: CASE_RESULT,
    location: 'Dela Cruz Backyard Piggery',
    remarks:
      'Taught cleaning and disinfection, no swill feeding, footbath at the gate, buying only pigs with papers.',
  });
  await response({
    type: 'DA_COORDINATION',
    on: CASE_RESULT,
    personnel: 'Dr. Liza Admin; DA Region V representative',
    remarks: 'Letter sent to DA Region V asking for a representative to document the euthanasia.',
  });
  await response({
    type: 'BARANGAY_COORDINATION',
    on: CASE_RESULT - 1,
    location: 'Brgy. Cararayan hall',
    personnel: 'Dr. Mark Inspector, Barangay Captain, BAT',
    remarks: 'Barangay informed; helped notify raisers within 1 km.',
  });
  await response({
    type: 'CULLING_DEPOPULATION',
    on: CASE_CULL,
    heads: 9,
    disposalMethod: 'Burial on the farm',
    location: 'Burial pit 50 m from the pens, inside the farm',
    personnel: 'City Vet team, DA Region V representative',
    remarks:
      'The 9 remaining pigs were euthanized and buried on the farm. Owner gave written consent; DA documented.',
  });
  await response({
    type: 'DISINFECTION',
    on: CASE_CULL,
    location: 'Pens, feeding area and access path',
    remarks: 'Lime and disinfectant applied; to be repeated after 7 days.',
  });
  await response({
    type: 'ASF_CHECKPOINT',
    on: CASE_CULL,
    end: -30,
    status: 'ONGOING',
    location: 'Cararayan–Pacol road junction',
    personnel: 'City Vet team, PNP Cararayan',
    remarks: 'Checks pigs and pork leaving the 1 km zone.',
  });

  /* ---------------- farm visits ---------------- */
  const visit = async (
    n: number,
    v: { farmId: number; on: number; purpose: string; caseId?: number; by: string; remarks: string },
  ) => {
    const created = await prisma.farmVisit.create({
      data: {
        code: code('VIS', n),
        farmId: v.farmId,
        caseId: v.caseId ?? null,
        date: D(ago(v.on)),
        purpose: v.purpose,
        findings: 'NO_SIGNS',
        visitedBy: v.by,
        remarks: v.remarks,
        createdBy: v.by,
        createdAt: DT(`${ago(v.on)}T15:00:00`),
      },
    });
    await log(
      'farm',
      v.farmId,
      'visit',
      `Farm visit ${created.code}: ${v.purpose.toLowerCase()}`,
      v.by,
      `${ago(v.on)}T15:00:00`,
    );
  };
  await visit(1, {
    farmId: ramonFarm.id,
    on: RECENT,
    purpose: 'DEWORMING',
    by: JOY,
    remarks: 'Carabao dewormed; one cow treated for a foot wound; head count verified.',
  });
  await visit(2, {
    farmId: elenaFarm.id,
    on: MONITOR,
    purpose: 'MONITORING',
    caseId: asf.id,
    by: MARK,
    remarks: 'Within 1 km of CASE-0001. All 60 pigs checked, no signs. 3 blood samples taken (SUB-0001).',
  });

  /* ---------------- lab submission: surveillance batch from the farm within 1 km ---------------- */
  const sub = await prisma.labSubmission.create({
    data: {
      code: code('SUB', 1),
      purpose: 'SURVEILLANCE',
      examination: ASF_TEST,
      laboratory: LAB,
      submittedAt: D(ago(MONITOR - 1)),
      submittedBy: MARK,
      notedBy: LIZA,
      requestId: 'CVO-REQ-2026-031',
      accessionNo: 'RADDL-2026-4137',
      remarks: 'Surveillance of pigs within 1 km of CASE-0001.',
      createdBy: MARK,
      createdAt: DT(`${ago(MONITOR - 1)}T16:00:00`),
    },
  });
  const stamp = ago(MONITOR).slice(2).replace(/-/g, '');
  await prisma.labRecord.createMany({
    data: [
      ['M', '3 m'],
      ['F', '4 m'],
      ['F', '1 yr'],
    ].map(([sex, age], i) => ({
      submissionId: sub.id,
      farmId: elenaFarm.id,
      species: 'Swine',
      sampleId: `S${stamp}-${String(i + 1).padStart(2, '0')}`,
      sampleType: 'Blood',
      condition: 'LIVE',
      animalAge: age,
      animalSex: sex,
      sampleCount: 1,
      testMethod: ASF_TEST,
      laboratory: LAB,
      submittedBy: MARK,
      collectedAt: D(ago(MONITOR)),
      sentAt: D(ago(MONITOR - 1)),
      result: 'NEGATIVE' as const,
      resultDate: D(ago(MONITOR - 3)),
      receivedVia: 'EMAIL',
    })),
  });
  await log(
    'lab-submission',
    sub.id,
    'created',
    `${sub.code}: 3 sample(s) for ${ASF_TEST} (surveillance)`,
    MARK,
    `${ago(MONITOR - 1)}T16:00:00`,
  );

  /* ---------------- services: one of each ---------------- */
  let srv = 0;
  const service = (s: {
    type: string;
    farmId: number;
    groupId?: number;
    animalId?: number;
    species: string;
    count: number;
    product: string;
    on: number;
    next?: string;
    result?: string;
    batch?: string;
    by: string;
    remarks: string;
    reminderDone?: boolean;
  }) =>
    prisma.vaccination.create({
      data: {
        code: code('SRV', ++srv),
        serviceType: s.type,
        farmId: s.farmId,
        target: s.animalId ? 'ANIMAL' : 'GROUP',
        groupId: s.groupId ?? null,
        animalId: s.animalId ?? null,
        species: s.species,
        count: s.count,
        vaccine: s.product,
        result: s.result ?? null,
        date: D(ago(s.on)),
        nextDate: s.next ? D(s.next) : null,
        doseNumber: 1,
        batch: s.batch ?? null,
        administeredBy: s.by,
        remarks: s.remarks,
        reminderDone: s.reminderDone ?? false,
      },
    });
  await service({
    type: 'VACCINATION',
    farmId: ramonFarm.id,
    animalId: cow.id,
    species: 'Cattle',
    count: 1,
    product: 'Hemosep Vaccine',
    on: 30,
    next: ahead(20),
    batch: 'LOT-011',
    by: MARK,
    remarks: 'Insured animal (PCIC); booster due in 50 days',
  });
  await log(
    'animal',
    cow.id,
    'vaccination',
    'Vaccinated: Hemosep Vaccine (dose 1)',
    MARK,
    `${ago(30)}T10:00:00`,
  );
  await service({
    type: 'DEWORMING',
    farmId: ramonFarm.id,
    groupId: ramonCarabao.id,
    species: 'Carabao',
    count: 4,
    product: 'Ivermectin',
    on: RECENT,
    next: ahead(75),
    by: JOY,
    remarks: 'Given during farm visit VIS-0001',
  });
  await service({
    type: 'TREATMENT',
    farmId: ramonFarm.id,
    groupId: ramonCattle.id,
    species: 'Cattle',
    count: 1,
    product: 'Oxytetracycline',
    on: RECENT,
    by: JOY,
    remarks: 'Foot wound treated during farm visit VIS-0001',
  });
  await service({
    type: 'INSEMINATION',
    farmId: ramonFarm.id,
    groupId: ramonCattle.id,
    species: 'Cattle',
    count: 1,
    product: 'Frozen semen — Brahman',
    on: 70,
    next: ago(10),
    by: JOY,
    remarks: 'Artificial insemination; pregnancy diagnosis after 60 days',
    reminderDone: true, // the pregnancy diagnosis below was done
  });
  await service({
    type: 'PREGNANCY_DIAGNOSIS',
    farmId: ramonFarm.id,
    groupId: ramonCattle.id,
    species: 'Cattle',
    count: 1,
    product: 'Rectal palpation',
    result: 'PREGNANT',
    on: 8,
    by: MARK,
    remarks: 'The cow inseminated 2 months ago is pregnant',
  });
  await service({
    type: 'CHECKUP',
    farmId: elenaFarm.id,
    groupId: elenaSwine.id,
    species: 'Swine',
    count: 60,
    product: 'Vitamins (B-complex)',
    on: MONITOR,
    by: MARK,
    remarks: 'All pigs checked during ASF monitoring (VIS-0002); no signs',
  });

  /* ---------------- insurance (PCIC): subsidized through RSBSA, with the insured ear tag ---------------- */
  await prisma.pcicPolicy.create({
    data: {
      ownerId: ramon.id,
      species: 'Cattle',
      heads: 1,
      amountCovered: 60000,
      applicationDate: D(ago(96)),
      applicationType: 'NEW',
      subsidized: true,
      rsbsaRef: 'RSBSA-05-17-24-0031',
      policyNo: 'PCIC-LV-2026-00204',
      startDate: D(ago(90)),
      endDate: D(ahead(275)),
      status: 'ACTIVE',
      remarks:
        'Premium paid through RSBSA. Cow ear-tagged (ET-2401) when insured. Attach the scanned form here.',
      animals: { connect: [{ id: cow.id }] },
    },
  });

  /* ---------------- settings ---------------- */
  const settings: Record<string, unknown> = {
    officeAddress: 'City Hall Compound, Naga City, Camarines Sur',
    officeContact: '(054) 000-0000',
    officeEmail: 'cvo@nagacityvet.gov.ph',
    [`vaccinationTargets:${new Date().getFullYear()}`]: [
      { vaccine: 'Hemosep Vaccine', species: 'Cattle', target: 10 },
    ],
  };
  for (const [key, value] of Object.entries(settings))
    await prisma.setting.create({ data: { key, value: JSON.stringify(value) } });

  console.log(
    'Done: 3 owners, 3 farms, 5 groups, 2 animals, 1 ownership record, 1 stray, 1 ASF case, ' +
      '1 lab submission, 6 services, 2 farm visits, 1 insurance application.',
  );
  console.log('Sign in with admin@nagacityvet.gov.ph / Livestock@2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());