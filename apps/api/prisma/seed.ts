/**
 * Seed data reproducing the Figma prototype: 20 owners, 28 farms, 59 population groups
 * (3,473 head), 12 tagged animals, 9 disease cases, 27 vaccination records and more.
 * Run with: pnpm db:seed   (wipes existing data first)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { SPECIES_ID_LETTER, addMonths, code, isoMonth, type Species } from '@livestock/shared';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { adapterFromUrl } from '../src/lib/adapter.ts';

const prisma = new PrismaClient({ adapter: adapterFromUrl(process.env.DATABASE_URL!) });

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DT = (s: string) => new Date(s); // local datetime string

const LIZA = 'Dr. Liza Admin';
const MARK = 'Dr. Mark Inspector';
const JOY = 'Dr. Joy Inspector';

/* ------------------------------ owners ------------------------------ */
const OWNERS: [string, string, string, string | null][] = [
  // name, barangay, zone, certification (RSBSA) number
  ['Juan Dela Cruz', 'Cararayan', 'Zone 1', '05-17-24-100-000'],
  ['Maria Santos', 'Cararayan', 'Zone 2', null],
  ['Jose Reyes', 'Cararayan', 'Zone 3', null],
  ['Ana Bautista', 'Cararayan', 'Zone 4', '05-17-24-103-003'],
  ['Pedro Villanueva', 'Cararayan', 'Zone 5', null],
  ['Rosa Aquino', 'Cararayan', 'Zone 6', null],
  ['Ramon Mendoza', 'Carolina', 'Zone 7', '05-17-24-106-006'],
  ['Elena Ramos', 'Carolina', 'Zone 1', null],
  ['Carlos Castillo', 'Pacol', 'Zone 2', null],
  ['Luz Navarro', 'Pacol', 'Zone 3', '05-17-24-109-000'],
  ['Antonio Flores', 'Panicuason', 'Zone 4', null],
  ['Teresa Garcia', 'San Felipe', 'Zone 5', null],
  ['Manuel Belmonte', 'Del Rosario', 'Zone 6', '05-17-24-112-003'],
  ['Cora Abad', 'Concepcion Grande', 'Zone 7', null],
  ['Roberto Peñaflor', 'Balatas', 'Zone 1', null],
  ['Nena Obias', 'San Isidro', 'Zone 2', '05-17-24-115-006'],
  ['Eduardo Sarmiento', 'Mabolo', 'Zone 3', null],
  ['Fe Rosales', 'Carolina', 'Zone 4', null],
  ['Ricardo Domingo', 'Pacol', 'Zone 5', '05-17-24-118-000'],
  ['Lorna Torres', 'San Felipe', 'Zone 6', null],
];
const STREETS = [
  'Rizal St.',
  'Mabini St.',
  'Bonifacio St.',
  'Luna St.',
  'Burgos St.',
  'Del Pilar St.',
  'Magsaysay Ave.',
];

/* ------------------------------ farms ------------------------------ */
type G = [Species, number, string]; // species, count, breed
type FarmSeed = {
  name: string;
  owner: number; // 1-based owner index
  type: string;
  lat: number | null;
  lng: number | null;
  status: 'verified' | 'overdue' | 'outdated';
  groups: G[];
};
const LW = 'Large White';
const NAT = 'Native';
const FARMS: FarmSeed[] = [
  {
    name: 'Ground Zero Piggery',
    owner: 1,
    type: 'commercial',
    lat: 13.638,
    lng: 123.238,
    status: 'verified',
    groups: [
      ['Swine', 40, LW],
      ['Chicken', 148, NAT],
    ],
  },
  {
    name: 'Cararayan Hog Farm',
    owner: 2,
    type: 'backyard',
    lat: 13.639775,
    lng: 123.238665,
    status: 'overdue',
    groups: [
      ['Swine', 40, LW],
      ['Chicken', 87, NAT],
    ],
  },
  {
    name: 'Bagong Buhay Backyard',
    owner: 3,
    type: 'commercial',
    lat: 13.637702,
    lng: 123.241503,
    status: 'overdue',
    groups: [
      ['Swine', 31, LW],
      ['Chicken', 100, NAT],
    ],
  },
  {
    name: 'Riverside Swine',
    owner: 4,
    type: 'backyard',
    lat: 13.63304,
    lng: 123.2389,
    status: 'verified',
    groups: [
      ['Swine', 26, LW],
      ['Chicken', 107, NAT],
    ],
  },
  {
    name: 'Mabuhay Farm',
    owner: 5,
    type: 'commercial',
    lat: 13.634717,
    lng: 123.23215,
    status: 'verified',
    groups: [
      ['Swine', 21, LW],
      ['Chicken', 185, NAT],
    ],
  },
  {
    name: 'Sunrise Livestock',
    owner: 6,
    type: 'backyard',
    lat: 13.642092,
    lng: 123.230707,
    status: 'overdue',
    groups: [
      ['Swine', 32, LW],
      ['Chicken', 171, NAT],
    ],
  },
  {
    name: 'Hillside Ranch',
    owner: 1,
    type: 'pasture',
    lat: 13.6466,
    lng: 123.2462,
    status: 'verified',
    groups: [
      ['Cattle', 11, 'Brahman'],
      ['Carabao', 7, 'Philippine Carabao'],
      ['Goat', 16, NAT],
    ],
  },
  {
    name: 'Green Pasture',
    owner: 2,
    type: 'backyard',
    lat: 13.6291,
    lng: 123.2441,
    status: 'overdue',
    groups: [
      ['Swine', 27, LW],
      ['Chicken', 158, NAT],
    ],
  },
  {
    name: 'Lakeside Poultry & Swine',
    owner: 3,
    type: 'mixed',
    lat: 13.6452,
    lng: 123.2268,
    status: 'verified',
    groups: [
      ['Swine', 17, LW],
      ['Chicken', 133, NAT],
      ['Cattle', 10, 'Brahman'],
    ],
  },
  {
    name: 'Carolina Cattle Range',
    owner: 7,
    type: 'pasture',
    lat: 13.6672,
    lng: 123.2768,
    status: 'overdue',
    groups: [
      ['Cattle', 14, 'Brahman'],
      ['Carabao', 7, 'Philippine Carabao'],
      ['Goat', 8, NAT],
    ],
  },
  {
    name: 'Isarog Foothill Farm',
    owner: 8,
    type: 'mixed',
    lat: 13.6705,
    lng: 123.2841,
    status: 'verified',
    groups: [
      ['Swine', 38, LW],
      ['Chicken', 94, NAT],
      ['Cattle', 9, 'Brahman'],
    ],
  },
  {
    name: 'Carolina Backyard',
    owner: 18,
    type: 'backyard',
    lat: 13.6618,
    lng: 123.2693,
    status: 'verified',
    groups: [
      ['Swine', 31, LW],
      ['Chicken', 167, NAT],
    ],
  },
  {
    name: 'Pacol Goat Farm',
    owner: 9,
    type: 'backyard',
    lat: 13.6571,
    lng: 123.2214,
    status: 'outdated',
    groups: [
      ['Goat', 15, 'Anglo-Nubian'],
      ['Sheep', 7, NAT],
    ],
  },
  {
    name: 'Pacol Poultry House',
    owner: 10,
    type: 'poultry',
    lat: 13.6528,
    lng: 123.2275,
    status: 'overdue',
    groups: [
      ['Chicken', 158, NAT],
      ['Other Poultry', 26, 'Muscovy'],
    ],
  },
  {
    name: 'Pacol Carabao Yard',
    owner: 19,
    type: 'backyard',
    lat: null,
    lng: null,
    status: 'verified',
    groups: [['Carabao', 3, 'Philippine Carabao']],
  },
  {
    name: 'Carolina Swine Pen',
    owner: 8,
    type: 'commercial',
    lat: 13.6639,
    lng: 123.2742,
    status: 'verified',
    groups: [
      ['Swine', 40, LW],
      ['Chicken', 180, NAT],
    ],
  },
  {
    name: 'Panicuason Highland',
    owner: 11,
    type: 'pasture',
    lat: 13.6735,
    lng: 123.3012,
    status: 'verified',
    groups: [
      ['Cattle', 14, 'Brahman'],
      ['Goat', 10, NAT],
      ['Carabao', 6, 'Philippine Carabao'],
    ],
  },
  {
    name: 'Flores Backyard',
    owner: 11,
    type: 'backyard',
    lat: 13.6702,
    lng: 123.2965,
    status: 'overdue',
    groups: [['Other Poultry', 23, 'Muscovy']],
  },
  {
    name: 'San Felipe Piggery',
    owner: 12,
    type: 'commercial',
    lat: 13.6418,
    lng: 123.2063,
    status: 'verified',
    groups: [
      ['Swine', 40, LW],
      ['Chicken', 141, NAT],
    ],
  },
  {
    name: 'Garcia Backyard',
    owner: 12,
    type: 'backyard',
    lat: 13.6402,
    lng: 123.2031,
    status: 'verified',
    groups: [],
  },
  {
    name: 'San Felipe Duck Farm',
    owner: 20,
    type: 'poultry',
    lat: 13.6437,
    lng: 123.2088,
    status: 'verified',
    groups: [['Duck', 179, 'Pateros']],
  },
  {
    name: 'Del Rosario Poultry',
    owner: 13,
    type: 'poultry',
    lat: 13.6128,
    lng: 123.2197,
    status: 'overdue',
    groups: [
      ['Chicken', 176, NAT],
      ['Other Poultry', 35, 'Muscovy'],
    ],
  },
  {
    name: 'Belmonte Mixed Farm',
    owner: 13,
    type: 'mixed',
    lat: 13.6151,
    lng: 123.2228,
    status: 'verified',
    groups: [
      ['Swine', 25, LW],
      ['Goat', 14, NAT],
      ['Cattle', 12, 'Brahman'],
      ['Sheep', 7, NAT],
    ],
  },
  {
    name: 'Concepcion Backyard',
    owner: 14,
    type: 'backyard',
    lat: 13.6182,
    lng: 123.2061,
    status: 'verified',
    groups: [
      ['Swine', 24, LW],
      ['Chicken', 134, NAT],
    ],
  },
  {
    name: 'Balatas Backyard',
    owner: 15,
    type: 'backyard',
    lat: 13.6331,
    lng: 123.1982,
    status: 'overdue',
    groups: [
      ['Swine', 22, LW],
      ['Chicken', 106, NAT],
    ],
  },
  {
    name: 'Mabolo Poultry',
    owner: 17,
    type: 'poultry',
    lat: 13.6203,
    lng: 123.1801,
    status: 'verified',
    groups: [['Chicken', 131, NAT]],
  },
  {
    name: 'San Isidro Ranch',
    owner: 16,
    type: 'mixed',
    lat: 13.6684,
    lng: 123.2553,
    status: 'verified',
    groups: [
      ['Swine', 22, LW],
      ['Chicken', 54, NAT],
      ['Goat', 24, NAT],
    ],
  },
  {
    name: 'Obias Farm',
    owner: 16,
    type: 'mixed',
    lat: 13.6659,
    lng: 123.2518,
    status: 'overdue',
    groups: [
      ['Chicken', 94, NAT],
      ['Cattle', 10, 'Brahman'],
      ['Carabao', 6, 'Philippine Carabao'],
    ],
  },
];

/* ------------------------------ animals ------------------------------ */
type AnimalSeed = {
  farm: string;
  species: Species;
  sex: string;
  age: string;
  markings: string;
  cowlick: string;
};
const ANIMALS: AnimalSeed[] = [
  {
    farm: 'Lakeside Poultry & Swine',
    species: 'Cattle',
    sex: 'Female',
    age: '3 yrs',
    markings: 'Dark brown, notched left ear',
    cowlick: 'Cowlick on right shoulder',
  },
  {
    farm: 'Lakeside Poultry & Swine',
    species: 'Cattle',
    sex: 'Male',
    age: '4 yrs',
    markings: 'Light grey, white blaze',
    cowlick: 'Cowlick on forehead',
  },
  {
    farm: 'Hillside Ranch',
    species: 'Carabao',
    sex: 'Female',
    age: '5 yrs',
    markings: 'Dark grey, curved horns',
    cowlick: 'Double whorl on rump',
  },
  {
    farm: 'Hillside Ranch',
    species: 'Carabao',
    sex: 'Male',
    age: '6 yrs',
    markings: 'Black, broken right horn tip',
    cowlick: 'Cowlick on left flank',
  },
  {
    farm: 'Lakeside Poultry & Swine',
    species: 'Cattle',
    sex: 'Female',
    age: '2 yrs',
    markings: 'Reddish brown, white socks',
    cowlick: 'Cowlick on neck',
  },
  {
    farm: 'Lakeside Poultry & Swine',
    species: 'Cattle',
    sex: 'Male',
    age: '3 yrs',
    markings: 'Grey, hump scar',
    cowlick: 'Cowlick on right shoulder',
  },
  {
    farm: 'Carolina Cattle Range',
    species: 'Cattle',
    sex: 'Female',
    age: '4 yrs',
    markings: 'Fawn, white tail switch',
    cowlick: 'Cowlick on forehead',
  },
  {
    farm: 'Carolina Cattle Range',
    species: 'Cattle',
    sex: 'Male',
    age: '5 yrs',
    markings: 'Dark grey, ear notch right',
    cowlick: 'Cowlick on back',
  },
  {
    farm: 'Carolina Cattle Range',
    species: 'Carabao',
    sex: 'Female',
    age: '7 yrs',
    markings: 'Grey, chevron on chest',
    cowlick: 'Whorl on left shoulder',
  },
  {
    farm: 'Carolina Cattle Range',
    species: 'Carabao',
    sex: 'Male',
    age: '4 yrs',
    markings: 'Black, short horns',
    cowlick: 'Whorl on forehead',
  },
  {
    farm: 'Isarog Foothill Farm',
    species: 'Cattle',
    sex: 'Female',
    age: '3 yrs',
    markings: 'White with grey speckles',
    cowlick: 'Cowlick on neck',
  },
  {
    farm: 'Isarog Foothill Farm',
    species: 'Cattle',
    sex: 'Male',
    age: '2 yrs',
    markings: 'Brown, star on forehead',
    cowlick: 'Cowlick on right flank',
  },
];

async function wipe() {
  // Child tables first.
  await prisma.activityLog.deleteMany();
  await prisma.caseStatusHistory.deleteMany();
  await prisma.investigation.deleteMany();
  await prisma.labRecord.deleteMany();
  await prisma.responseActivity.deleteMany();
  await prisma.diseaseCase.deleteMany();
  await prisma.vaccination.deleteMany();
  await prisma.ownershipTransfer.deleteMany();
  await prisma.strayIncident.deleteMany();
  await prisma.animal.deleteMany();
  await prisma.populationUpdate.deleteMany();
  await prisma.populationGroup.deleteMany();
  await prisma.farm.deleteMany();
  await prisma.pcicPolicy.deleteMany();
  await prisma.owner.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  // Reset auto-increment so codes start at 0001.
  for (const t of [
    'ActivityLog',
    'CaseStatusHistory',
    'Investigation',
    'LabRecord',
    'ResponseActivity',
    'DiseaseCase',
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

async function main() {
  console.log('Seeding Naga City livestock data…');
  await wipe();

  /* users */
  const hash = await bcrypt.hash('Livestock@2026', 10);
  const users = await Promise.all(
    [
      { name: LIZA, email: 'admin@nagacityvet.gov.ph', role: 'ADMIN' as const, title: 'Administrator' },
      { name: MARK, email: 'mark@nagacityvet.gov.ph', role: 'STAFF' as const, title: 'Veterinary Inspector' },
      { name: JOY, email: 'joy@nagacityvet.gov.ph', role: 'STAFF' as const, title: 'Veterinary Inspector' },
      {
        name: 'Records Viewer',
        email: 'viewer@nagacityvet.gov.ph',
        role: 'READONLY' as const,
        title: 'Read-only',
      },
    ].map((u) => prisma.user.create({ data: { ...u, passwordHash: hash } })),
  );
    const markId = users[1].id;

  // `--empty`: start fresh — keep only the login accounts, no demo records.
  if (process.argv.includes('--empty')) {
    console.log('Empty database ready: 4 login accounts, no owners/farms/cases.');
    return;
  }

  /* owners */
  const owners = [];
  for (let i = 0; i < OWNERS.length; i++) {
    const [fullName, barangay, zone, rsbsa] = OWNERS[i];
    const id = i + 1;
    owners.push(
      await prisma.owner.create({
        data: {
          code: code('OWN', id),
          fullName,
          barangay,
          zone,
          rsbsa,
          street: `${10 * ((i % 9) + 1)} ${STREETS[i % STREETS.length]}`,
          contact: `0917-555-${String(1000 + i * 37).padStart(4, '0')}`,
          registeredAt: DT(`2026-05-0${(i % 8) + 1}T09:00:00`),
        },
      }),
    );
  }

  /* farms, groups, monthly updates */
  const now = isoMonth();
  const farms: Awaited<ReturnType<typeof prisma.farm.create>>[] = [];
  const groupsByFarm = new Map<string, { id: number; species: string; code: string; count: number }[]>();
  let groupId = 0;
  for (let i = 0; i < FARMS.length; i++) {
    const f = FARMS[i];
    const owner = owners[f.owner - 1];
    const farm = await prisma.farm.create({
      data: {
        code: code('FRM', i + 1),
        name: f.name,
        ownerId: owner.id,
        type: f.type,
        barangay: owner.barangay,
        zone: owner.zone,
        address: `${owner.zone}, Brgy. ${owner.barangay}, Naga City`,
        pastureArea: f.type === 'pasture' ? 2.5 : null,
        lat: f.lat,
        lng: f.lng,
        createdAt: DT(`2026-05-${String((i % 20) + 1).padStart(2, '0')}T08:00:00`),
      },
    });
    farms.push(farm);
    const last =
      f.status === 'verified' ? now : f.status === 'overdue' ? addMonths(now, -1) : addMonths(now, -2);
    const list: { id: number; species: string; code: string; count: number }[] = [];
    for (const [species, count, breed] of f.groups) {
      groupId += 1;
      const g = await prisma.populationGroup.create({
        data: {
          code: code('GRP', groupId),
          farmId: farm.id,
          species,
          breed,
          count,
          lastVerified: last,
          createdAt: DT('2026-05-01T08:00:00'),
        },
      });
      list.push({ id: g.id, species, code: g.code, count });
      // Monthly history from May 2026 to the last verified month; slight growth to today's count.
      const months: string[] = [];
      for (let m = '2026-05'; m <= last; m = addMonths(m, 1)) months.push(m);
      let prev: number | null = null;
      for (let k = 0; k < months.length; k++) {
        const stepsBack = months.length - 1 - k;
        const value =
          k === months.length - 1 ? count : Math.max(0, Math.round(count * (1 - 0.02 * stepsBack)));
        await prisma.populationUpdate.create({
          data: {
            groupId: g.id,
            month: months[k],
            count: value,
            previous: prev,
            change: value - (prev ?? 0),
            reason:
              k === 0
                ? 'Initial count'
                : value - (prev ?? 0) > 0
                  ? `births +${value - (prev ?? 0)}`
                  : value === prev
                    ? 'No change'
                    : `deaths ${value - (prev ?? 0)}`,
            createdBy: k % 2 ? JOY : MARK,
            createdAt: DT(`${months[k]}-05T10:00:00`),
          },
        });
        prev = value;
      }
    }
    groupsByFarm.set(f.name, list);
  }

  // One amended month to illustrate "Adjusted": GRP-0001 Sep entry re-saved.
  const sep = await prisma.populationUpdate.findFirst({ where: { groupId: 1, month: addMonths(now, -1) } });
  if (sep) {
    await prisma.populationUpdate.update({ where: { id: sep.id }, data: { superseded: true } });
    await prisma.populationUpdate.create({
      data: {
        groupId: 1,
        month: sep.month,
        count: sep.count,
        previous: sep.previous,
        change: sep.change,
        reason: 'Recount after site visit',
        createdBy: MARK,
      },
    });
  }

  const farmByName = (n: string) => farms.find((f) => f.name === n)!;
  const groupOf = (farm: string, species: string) =>
    groupsByFarm.get(farm)!.find((g) => g.species === species)!;

  /* animals */
  const animals = [];
  for (let i = 0; i < ANIMALS.length; i++) {
    const a = ANIMALS[i];
    const g = groupOf(a.farm, a.species);
    const letter = SPECIES_ID_LETTER[a.species];
    const animal = await prisma.animal.create({
      data: {
        code: `NC-${letter}-${String(i + 1).padStart(4, '0')}`,
        earTag: `ET-${2401 + i}`,
        groupId: g.id,
        species: a.species,
        breed: a.species === 'Cattle' ? 'Brahman' : 'Philippine Carabao',
        sex: a.sex,
        estimatedAge: a.age,
        lifeStage: 'adult',
        markings: a.markings,
        cowlick: a.cowlick,
        health: 'healthy',
        createdAt: DT('2026-06-02T09:00:00'),
      },
    });
    animals.push(animal);
    await prisma.activityLog.create({
      data: {
        entity: 'animal',
        entityId: animal.id,
        action: 'registered',
        summary: `Registered with ear tag ${animal.earTag}`,
        byName: MARK,
        createdAt: DT('2026-06-02T09:00:00'),
      },
    });
  }

  /* ownership transfers (final state already reflected above) */
  const hill = farmByName('Hillside Ranch');
  const lake = farmByName('Lakeside Poultry & Swine');
  const ccr = farmByName('Carolina Cattle Range');
  const transfers: [number, string, number, number, number, number, 'TRANSFER' | 'REVERSAL', string][] = [
    [1, '2026-07-15', 1, hill.id, 3, lake.id, 'TRANSFER', 'Sale between registered owners'],
    [2, '2026-08-15', 1, hill.id, 3, lake.id, 'TRANSFER', 'Sale between registered owners'],
    [3, '2026-09-15', 1, hill.id, 7, ccr.id, 'TRANSFER', 'Sale between registered owners'],
    [3, '2026-10-01', 7, ccr.id, 1, hill.id, 'REVERSAL', 'Reversal — recorded in error'],
  ];
  for (let i = 0; i < transfers.length; i++) {
    const [animalId, date, fromOwnerId, fromFarmId, toOwnerId, toFarmId, type, remarks] = transfers[i];
    const t = await prisma.ownershipTransfer.create({
      data: {
        code: code('TRF', i + 1),
        animalId,
        date: D(date),
        fromOwnerId,
        fromFarmId,
        toOwnerId,
        toFarmId,
        type,
        remarks,
        createdBy: MARK,
      },
    });
    await prisma.activityLog.create({
      data: {
        entity: 'animal',
        entityId: animalId,
        action: type === 'REVERSAL' ? 'reversal' : 'transfer',
        summary: `${type === 'REVERSAL' ? 'Reversal' : 'Transfer'} ${t.code}: ${owners[fromOwnerId - 1].fullName} → ${owners[toOwnerId - 1].fullName}`,
        byName: MARK,
        createdAt: DT(`${date}T10:00:00`),
      },
    });
  }

  /* stray incidents */
  const strays = [
    {
      at: '2026-09-20T09:36:00',
      species: 'Cattle',
      earTag: 'ET-2404',
      animalId: 4,
      ownerId: 1,
      barangay: 'Carolina',
      location: 'Carolina–Panicuason road, near chapel',
      lat: 13.6655,
      lng: 123.2731,
      status: 'IMPOUNDED' as const,
      violations: 1,
    },
    {
      at: '2026-09-24T09:36:00',
      species: 'Goat',
      earTag: null,
      animalId: null,
      ownerId: 10,
      barangay: 'Pacol',
      location: 'Pacol elementary school grounds',
      lat: null,
      lng: null,
      status: 'REPORTED' as const,
      violations: 0,
    },
    {
      at: '2026-09-28T09:36:00',
      species: 'Carabao',
      earTag: null,
      animalId: null,
      ownerId: 11,
      barangay: 'San Felipe',
      location: 'San Felipe rice fields, Zone 3',
      lat: 13.6425,
      lng: 123.2101,
      status: 'RELEASED' as const,
      violations: 1,
    },
    {
      at: '2026-10-02T09:36:00',
      species: 'Swine',
      earTag: null,
      animalId: null,
      ownerId: 12,
      barangay: 'Cararayan',
      location: 'Cararayan public market',
      lat: 13.6372,
      lng: 123.2359,
      status: 'CLOSED' as const,
      violations: 1,
    },
  ];
  for (let i = 0; i < strays.length; i++) {
    const s = strays[i];
    await prisma.strayIncident.create({
      data: {
        code: code('STR', i + 1),
        discoveredAt: DT(s.at),
        species: s.species,
        earTag: s.earTag,
        animalId: s.animalId,
        ownerId: s.ownerId,
        barangay: s.barangay,
        location: s.location,
        description: 'Found roaming without handler.',
        lat: s.lat,
        lng: s.lng,
        status: s.status,
        violations: s.violations,
        createdBy: MARK,
      },
    });
  }

  /* disease cases */
  type CaseSeed = {
    farm: string;
    disease: string;
    species: Species;
    affected: number;
    deaths: number;
    reported: string;
    status: string;
    sample?: string;
  };
  const CASES: CaseSeed[] = [
    {
      farm: 'Ground Zero Piggery',
      disease: 'African Swine Fever (ASF)',
      species: 'Swine',
      affected: 10,
      deaths: 1,
      reported: '2026-08-31',
      status: 'POSITIVE',
      sample: 'Blood & tissue samples',
    },
    {
      farm: 'Carolina Backyard',
      disease: 'Hog Cholera',
      species: 'Swine',
      affected: 12,
      deaths: 1,
      reported: '2026-09-04',
      status: 'NEGATIVE',
      sample: 'Whole blood',
    },
    {
      farm: 'Bagong Buhay Backyard',
      disease: 'African Swine Fever (ASF)',
      species: 'Swine',
      affected: 8,
      deaths: 2,
      reported: '2026-09-08',
      status: 'AWAITING_RESULT',
      sample: 'Whole blood',
    },
    {
      farm: 'San Felipe Piggery',
      disease: 'Porcine Reproductive & Respiratory Syndrome',
      species: 'Swine',
      affected: 9,
      deaths: 2,
      reported: '2026-09-12',
      status: 'SENT_TO_LAB',
      sample: 'Whole blood',
    },
    {
      farm: 'Carolina Cattle Range',
      disease: 'Peste des Petits Ruminants',
      species: 'Goat',
      affected: 10,
      deaths: 2,
      reported: '2026-09-16',
      status: 'SAMPLE_COLLECTED',
      sample: 'Nasal swabs',
    },
    {
      farm: 'Mabolo Poultry',
      disease: 'Newcastle Disease',
      species: 'Chicken',
      affected: 10,
      deaths: 3,
      reported: '2026-09-20',
      status: 'SUSPECTED',
    },
    {
      farm: 'Panicuason Highland',
      disease: 'Foot and Mouth Disease (suspected)',
      species: 'Cattle',
      affected: 13,
      deaths: 1,
      reported: '2026-09-24',
      status: 'AWAITING_RESULT',
      sample: 'Vesicular fluid',
    },
    {
      farm: 'San Isidro Ranch',
      disease: 'Swine Erysipelas',
      species: 'Swine',
      affected: 10,
      deaths: 1,
      reported: '2026-09-28',
      status: 'SUSPECTED',
    },
    {
      farm: 'Pacol Carabao Yard',
      disease: 'Hemorrhagic Septicemia (suspected)',
      species: 'Carabao',
      affected: 12,
      deaths: 2,
      reported: '2026-10-07',
      status: 'SUSPECTED',
    },
  ];
  const ORDER = ['SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'AWAITING_RESULT', 'POSITIVE'] as const;
  const CODES: Record<string, string> = {
    SAMPLE_COLLECTED: 'sample_collected',
    SENT_TO_LAB: 'sent_to_lab',
    AWAITING_RESULT: 'awaiting_result',
    POSITIVE: 'positive',
    NEGATIVE: 'negative',
  };
  const addDays = (s: string, n: number) => {
    const d = D(s);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const farm = farmByName(c.farm);
    const owner = owners.find((o) => o.id === farm.ownerId)!;
    const created = await prisma.diseaseCase.create({
      data: {
        code: code('CASE', i + 1),
        ownerId: owner.id,
        farmId: farm.id,
        barangay: farm.barangay,
        zone: farm.zone,
        species: c.species,
        disease: c.disease,
        affected: c.affected,
        deaths: c.deaths,
        reportedAt: D(c.reported),
        symptoms: 'Fever, loss of appetite, reddish skin discoloration (as reported by owner)',
        reportedBy: 'Barangay Agricultural Technician',
        assignedToId: markId,
        sampleInfo: c.sample ?? null,
        lat: farm.lat,
        lng: farm.lng,
        locationSource: farm.lat != null ? 'Farm Coordinates' : null,
        status: c.status as any,
        createdAt: DT(`${c.reported}T02:33:00`),
      },
    });
    // Status history through to the current status.
    const path: string[] =
      c.status === 'NEGATIVE'
        ? [...ORDER.slice(0, 4), 'NEGATIVE']
        : ORDER.slice(0, ORDER.indexOf(c.status as any) + 1);
    for (let k = 0; k < path.length; k++) {
      const by = path[k] === 'POSITIVE' || path[k] === 'NEGATIVE' ? LIZA : MARK;
      await prisma.caseStatusHistory.create({
        data: {
          caseId: created.id,
          status: path[k] as any,
          note: k === 0 ? 'Case reported' : `Advanced to ${CODES[path[k]]}`,
          byName: by,
          at: DT(`${addDays(c.reported, k * 2)}T23:43:00`),
        },
      });
    }
    await prisma.activityLog.create({
      data: {
        entity: 'case',
        entityId: created.id,
        action: 'reported',
        summary: `Disease case ${created.code} reported (${c.disease})`,
        byName: MARK,
        createdAt: DT(`${c.reported}T02:33:00`),
      },
    });
    if (c.status === 'POSITIVE') {
      await prisma.activityLog.create({
        data: {
          entity: 'case',
          entityId: created.id,
          action: 'status',
          summary: `${created.code} confirmed POSITIVE — ${c.disease}`,
          byName: LIZA,
          createdAt: DT(`${addDays(c.reported, 8)}T02:33:00`),
        },
      });
    }
    if (c.sample) {
      await prisma.investigation.create({
        data: {
          caseId: created.id,
          date: D(c.reported),
          investigator: MARK,
          notes: 'Site visit conducted; animals observed; owner interviewed.',
        },
      });
    }
    if (['POSITIVE', 'NEGATIVE', 'AWAITING_RESULT', 'SENT_TO_LAB'].includes(c.status)) {
      await prisma.labRecord.create({
        data: {
          caseId: created.id,
          sampleId: `RADDL-${created.code}`,
          sampleType: 'Whole blood',
          collectedAt: D(c.reported),
          laboratory: 'RADDL Region V, Pili',
          sentAt: D(c.reported),
          result: c.status === 'POSITIVE' ? 'POSITIVE' : c.status === 'NEGATIVE' ? 'NEGATIVE' : 'PENDING',
          resultDate: c.status === 'POSITIVE' || c.status === 'NEGATIVE' ? D(addDays(c.reported, 7)) : null,
        },
      });
    }
    if (c.status === 'POSITIVE') {
      await prisma.responseActivity.create({
        data: {
          caseId: created.id,
          type: 'OWNER_NOTIFICATION',
          date: D(c.reported),
          personnel: MARK,
          remarks: 'Owners within 1 km notified.',
        },
      });
      await prisma.responseActivity.create({
        data: {
          caseId: created.id,
          type: 'ASF_CHECKPOINT',
          date: D(c.reported),
          personnel: 'City Vet Team A',
          remarks: 'Checkpoint at Cararayan road.',
        },
      });
    }
  }

  /* vaccinations — 27 records */
  type V = [string, string, string, 'G' | 'A', string, number, number, string | null]; // date, vaccine, farm, target, groupSpecies|animalCode, count, dose, next
  const HC = 'Hog Cholera Vaccine';
  const NCD = 'NCD Vaccine';
  const HS = 'Hemosep Vaccine';
  const VAX: V[] = [
    ['2026-08-10', HC, 'Ground Zero Piggery', 'G', 'Swine', 28, 1, '2026-10-15'],
    ['2026-09-12', HC, 'Ground Zero Piggery', 'G', 'Swine', 26, 2, null],
    ['2026-08-11', NCD, 'Ground Zero Piggery', 'G', 'Chicken', 104, 1, null],
    ['2026-08-12', HC, 'Cararayan Hog Farm', 'G', 'Swine', 28, 1, null],
    ['2026-08-13', NCD, 'Cararayan Hog Farm', 'G', 'Chicken', 61, 1, '2026-10-18'],
    ['2026-08-14', HC, 'Bagong Buhay Backyard', 'G', 'Swine', 22, 1, null],
    ['2026-09-12', HC, 'Bagong Buhay Backyard', 'G', 'Swine', 20, 2, null],
    ['2026-08-15', NCD, 'Bagong Buhay Backyard', 'G', 'Chicken', 70, 1, null],
    ['2026-08-16', HC, 'Riverside Swine', 'G', 'Swine', 18, 1, '2026-10-21'],
    ['2026-08-17', NCD, 'Riverside Swine', 'G', 'Chicken', 75, 1, null],
    ['2026-08-18', HC, 'Mabuhay Farm', 'G', 'Swine', 15, 1, null],
    ['2026-09-12', HC, 'Mabuhay Farm', 'G', 'Swine', 13, 2, null],
    ['2026-08-10', NCD, 'Mabuhay Farm', 'G', 'Chicken', 130, 1, '2026-10-24'],
    ['2026-08-11', HC, 'Sunrise Livestock', 'G', 'Swine', 22, 1, null],
    ['2026-08-12', NCD, 'Sunrise Livestock', 'G', 'Chicken', 120, 1, null],
    ['2026-08-13', HS, 'Hillside Ranch', 'G', 'Cattle', 8, 1, '2026-10-27'],
    ['2026-09-12', HS, 'Hillside Ranch', 'G', 'Cattle', 6, 2, null],
    ['2026-08-14', HS, 'Hillside Ranch', 'G', 'Carabao', 5, 1, null],
    ['2026-08-08', HS, 'Lakeside Poultry & Swine', 'A', 'NC-C-0001', 1, 1, null],
    ['2026-08-08', HS, 'Lakeside Poultry & Swine', 'A', 'NC-C-0002', 1, 1, null],
    ['2026-09-08', HS, 'Lakeside Poultry & Swine', 'A', 'NC-C-0002', 1, 2, null],
    ['2026-08-08', HS, 'Hillside Ranch', 'A', 'NC-K-0003', 1, 1, null],
    ['2026-08-08', HS, 'Hillside Ranch', 'A', 'NC-K-0004', 1, 1, null],
    ['2026-09-08', HS, 'Hillside Ranch', 'A', 'NC-K-0004', 1, 2, null],
    ['2026-08-08', HS, 'Lakeside Poultry & Swine', 'A', 'NC-C-0005', 1, 1, null],
    ['2026-08-08', HS, 'Lakeside Poultry & Swine', 'A', 'NC-C-0006', 1, 1, null],
    ['2026-09-08', HS, 'Lakeside Poultry & Swine', 'A', 'NC-C-0006', 1, 2, null],
  ];
  for (let i = 0; i < VAX.length; i++) {
    const [date, vaccine, farmName, t, ref, count, dose, next] = VAX[i];
    const farm = farmByName(farmName);
    const group = t === 'G' ? groupOf(farmName, ref) : null;
    const animal = t === 'A' ? animals.find((a) => a.code === ref)! : null;
    await prisma.vaccination.create({
      data: {
        code: code('VAX', i + 1),
        farmId: farm.id,
        target: t === 'G' ? 'GROUP' : 'ANIMAL',
        groupId: group?.id ?? null,
        animalId: animal?.id ?? null,
        species: group?.species ?? animal!.species,
        count,
        vaccine,
        date: D(date),
        nextDate: next ? D(next) : null,
        doseNumber: dose,
        batch: `LOT-${date.slice(5, 7)}${String(i + 11).padStart(3, '0')}`,
        administeredBy: date === '2026-09-12' ? JOY : MARK,
      },
    });
    if (animal) {
      await prisma.activityLog.create({
        data: {
          entity: 'animal',
          entityId: animal.id,
          action: 'vaccination',
          summary: `Vaccinated: ${vaccine} (dose ${dose})`,
          byName: MARK,
          createdAt: DT(`${date}T10:00:00`),
        },
      });
    }
  }

  /* PCIC insurance */
  await prisma.pcicPolicy.createMany({
    data: [
      {
        ownerId: 1,
        policyNo: 'PCIC-LV-2026-00118',
        species: 'Swine',
        heads: 40,
        amountCovered: 400000,
        startDate: D('2026-05-15'),
        endDate: D('2027-05-14'),
        status: 'ACTIVE',
      },
      {
        ownerId: 1,
        policyNo: 'PCIC-LV-2026-00119',
        species: 'Carabao',
        heads: 7,
        amountCovered: 280000,
        startDate: D('2026-06-01'),
        endDate: D('2027-05-31'),
        status: 'ACTIVE',
      },
      {
        ownerId: 7,
        policyNo: 'PCIC-LV-2026-00204',
        species: 'Cattle',
        heads: 14,
        amountCovered: 560000,
        startDate: D('2026-06-10'),
        endDate: D('2027-06-09'),
        status: 'ACTIVE',
      },
      {
        ownerId: 4,
        policyNo: 'PCIC-LV-2025-00977',
        species: 'Swine',
        heads: 20,
        amountCovered: 180000,
        startDate: D('2025-07-01'),
        endDate: D('2026-06-30'),
        status: 'EXPIRED',
      },
    ],
  });

  const total = await prisma.populationGroup.aggregate({ _sum: { count: true } });
  console.log(
    `Done: ${owners.length} owners, ${farms.length} farms, ${groupId} groups (${total._sum.count} head), ${animals.length} animals, ${CASES.length} cases, ${VAX.length} vaccinations.`,
  );
  console.log('Sign in with admin@nagacityvet.gov.ph / Livestock@2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
