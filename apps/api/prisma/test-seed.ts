/**
 * TEST FIXTURE used by the automated tests (pnpm test, Playwright). The demo data is prisma/seed.ts.
 * Demo data for Naga City: 21 owners, 29 farms, 60 population groups (3,473 head), 15 tagged animals,
 * 13 disease cases, 32 vaccination records, 6 stray reports, 5 PCIC policies and this year's
 * vaccination targets. Every form has at least one complete example: pastures, an archived owner,
 * farm and group, sold and dead animals, stray fines, every visit type, lab results,
 * every response measure (planned, ongoing, late, completed), a closed case, a related case, and
 * records voided by mistake. Recent records are dated relative to today, so the hotspot, the
 * comparison, My tasks and the reminders always have something to show on the day of the demo.
 * Run with: pnpm db:seed         (wipes existing data, loads the demo data)
 *           pnpm db:seed:empty   (wipes existing data, keeps only the 4 login accounts)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { SPECIES_ID_LETTER, addMonths, code, isoDate, isoMonth, type Species } from '@livestock/shared';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { adapterFromUrl } from '../src/lib/adapter.ts';

// Same fallback as prisma.config.ts, so seeding works even before apps/api/.env exists.
const DATABASE_URL = process.env.DATABASE_URL ?? 'mysql://livestock:livestock@localhost:3306/livestock';
const prisma = new PrismaClient({ adapter: adapterFromUrl(DATABASE_URL) });

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DT = (s: string) => new Date(s); // local datetime string
/** YYYY-MM-DD n days before today (negative n = days ahead). Keeps the recent demo records current. */
const ago = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
};
const ahead = (n: number) => ago(-n);

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
const OWNER_REMARKS: Record<number, string> = {
  1: 'President, Cararayan Hog Raisers Association',
  7: 'Also tends the communal pasture in upper Carolina',
  13: 'Prefers calls after 4 PM',
};
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
    type: 'backyard',
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
    type: 'backyard',
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
    type: 'backyard',
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
    type: 'backyard',
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
    type: 'commercial',
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
    type: 'backyard',
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
    type: 'commercial',
    lat: 13.6437,
    lng: 123.2088,
    status: 'verified',
    groups: [['Duck', 179, 'Pateros']],
  },
  {
    name: 'Del Rosario Poultry',
    owner: 13,
    type: 'commercial',
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
    type: 'backyard',
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
    type: 'commercial',
    lat: 13.6203,
    lng: 123.1801,
    status: 'verified',
    groups: [['Chicken', 131, NAT]],
  },
  {
    name: 'San Isidro Ranch',
    owner: 16,
    type: 'backyard',
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
    type: 'backyard',
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
  breed?: string;
  dob?: string;
  lifeStage?: string;
  health?: string;
  status?: 'ACTIVE' | 'SOLD' | 'DECEASED';
  remarks?: string;
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
  // A goat: no cowlick (it is asked only for cattle and carabao), date of birth instead of an age.
  {
    farm: 'Hillside Ranch',
    species: 'Goat',
    sex: 'Female',
    age: '',
    dob: '2024-03-15',
    breed: 'Native',
    lifeStage: 'breeder',
    markings: 'White with brown head, ear tag on right ear',
    cowlick: '',
    remarks: 'Breeder doe, kidded twice',
  },
  // No longer active: one died, one was sold outside the city.
  {
    farm: 'Isarog Foothill Farm',
    species: 'Cattle',
    sex: 'Female',
    age: '8 yrs',
    markings: 'Red, white patch on left flank',
    cowlick: 'Cowlick on forehead',
    status: 'DECEASED',
    health: 'deceased',
    remarks: 'Died of old age; carcass buried on the farm (reported by owner)',
  },
  {
    farm: 'Panicuason Highland',
    species: 'Carabao',
    sex: 'Male',
    age: '9 yrs',
    markings: 'Dark grey, long swept-back horns',
    cowlick: 'Whorl on right shoulder',
    status: 'SOLD',
    remarks: 'Sold to a buyer in Pili, Camarines Sur (outside the city)',
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
  await prisma.farmVisit.deleteMany();
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

  // `--empty`: start fresh — keep only the login accounts, no demo records.
  if (process.argv.includes('--empty')) {
    console.log(
      'Empty database ready: 4 login accounts, no owners/farms/cases. Sign in with admin@nagacityvet.gov.ph / Livestock@2026',
    );
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
          remarks: OWNER_REMARKS[id] ?? null,
        },
      }),
    );
  }
  // A raiser who stopped raising livestock and moved away: archived, kept for the records.
  await prisma.owner.create({
    data: {
      code: code('OWN', 21),
      fullName: 'Danilo Prieto',
      barangay: 'Abella',
      zone: 'Zone 2',
      street: '15 Panganiban Drive',
      contact: '0917-555-1780',
      status: 'ARCHIVED',
      remarks: 'Sold all his pigs and moved to Pili, Camarines Sur (Sept 2026). Archived, not deleted.',
      registeredAt: DT('2026-05-04T09:00:00'),
    },
  });

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

  /* farm details: pastures (location + pin), remarks, herd health */
  const PASTURES: [string, number, string, number, number][] = [
    ['Hillside Ranch', 4, 'Communal grazing land, Sitio Kinalabasahan, Cararayan', 13.6521, 123.2547],
    ['Panicuason Highland', 6.5, 'Mt. Isarog foothills grazing area, Panicuason', 13.6788, 123.3071],
  ];
  for (const [name, area, location, lat, lng] of PASTURES)
    await prisma.farm.update({
      where: { id: farmByName(name).id },
      data: { pastureArea: area, pastureLocation: location, pastureLat: lat, pastureLng: lng },
    });
  const FARM_REMARKS: [string, string][] = [
    [
      'Ground Zero Piggery',
      'ASF confirmed Sept 2026 (CASE-0001). No restocking until cleared by the City Vet.',
    ],
    ['Garcia Backyard', 'Newly registered; pens still being built, no animals yet.'],
    ['Pacol Carabao Yard', 'Owner could not give the exact location; pin it on the next visit.'],
  ];
  for (const [name, remarks] of FARM_REMARKS)
    await prisma.farm.update({ where: { id: farmByName(name).id }, data: { remarks } });
  const HERD_HEALTH: [string, string, string, string][] = [
    ['Ground Zero Piggery', 'Swine', 'Quarantined', 'Under quarantine since the ASF case'],
    [
      'Bagong Buhay Backyard',
      'Swine',
      'Quarantined',
      'Precautionary quarantine while waiting for the ASF result',
    ],
    ['Panicuason Highland', 'Cattle', 'Quarantined', 'FMD suspected (CASE-0007)'],
    ['Del Rosario Poultry', 'Chicken', 'Sick', 'Newcastle disease suspected (CASE-0010)'],
    ['Mabolo Poultry', 'Chicken', 'Under treatment', 'Vitamins and antibiotics while waiting for a visit'],
  ];
  for (const [farm, species, healthStatus, remarks] of HERD_HEALTH)
    await prisma.populationGroup.update({
      where: { id: groupOf(farm, species).id },
      data: { healthStatus, remarks },
    });
  // Hillside goats: a breeding herd of does.
  await prisma.populationGroup.update({
    where: { id: groupOf('Hillside Ranch', 'Goat').id },
    data: { sex: 'Female', lifeStage: 'breeder' },
  });

  // A farm that stopped operating: archived (with its emptied group), kept for the records.
  const closedFarm = await prisma.farm.create({
    data: {
      code: code('FRM', FARMS.length + 1),
      name: 'Torres Piggery (closed)',
      ownerId: owners[19].id,
      type: 'backyard',
      barangay: owners[19].barangay,
      zone: owners[19].zone,
      address: `${owners[19].zone}, Brgy. ${owners[19].barangay}, Naga City`,
      lat: 13.6449,
      lng: 123.2115,
      remarks: 'Stopped raising pigs in June 2026; pens taken down. Archived, not deleted.',
      archived: true,
      createdAt: DT('2026-05-21T08:00:00'),
    },
  });
  groupId += 1;
  const closedGroup = await prisma.populationGroup.create({
    data: {
      code: code('GRP', groupId),
      farmId: closedFarm.id,
      species: 'Swine',
      breed: LW,
      count: 0,
      lastVerified: '2026-06',
      remarks: 'All pigs sold before the farm closed',
      archived: true,
      createdAt: DT('2026-05-01T08:00:00'),
    },
  });
  await prisma.populationUpdate.createMany({
    data: [
      {
        groupId: closedGroup.id,
        month: '2026-05',
        count: 12,
        change: 12,
        reason: 'Initial count',
        createdBy: MARK,
      },
      {
        groupId: closedGroup.id,
        month: '2026-06',
        count: 0,
        previous: 12,
        change: -12,
        reason: 'Sold — farm closed',
        createdBy: JOY,
      },
    ],
  });

  /* animals */
  const animals: Awaited<ReturnType<typeof prisma.animal.create>>[] = [];
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
        breed: a.breed ?? (a.species === 'Cattle' ? 'Brahman' : 'Philippine Carabao'),
        sex: a.sex,
        dob: a.dob ? D(a.dob) : null,
        estimatedAge: a.age || null,
        lifeStage: a.lifeStage ?? 'adult',
        markings: a.markings,
        cowlick: a.cowlick || null,
        health: a.health ?? 'healthy',
        status: a.status ?? 'ACTIVE',
        remarks: a.remarks ?? null,
        createdAt: DT('2026-06-02T09:00:00'),
      },
    });
    animals.push(animal);
    if (a.status && a.status !== 'ACTIVE')
      await prisma.activityLog.create({
        data: {
          entity: 'animal',
          entityId: animal.id,
          action: 'status',
          summary: `Status changed to ${a.status === 'SOLD' ? 'Sold' : 'Deceased'} — ${a.remarks}`,
          byName: JOY,
          createdAt: DT(`${ago(25)}T14:00:00`),
        },
      });
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

  /* stray incidents: open and closed, with fine details where they apply */
  type StraySeed = {
    at: string;
    species: string;
    earTag?: string;
    animalId?: number;
    ownerId?: number;
    barangay: string;
    location: string;
    description: string;
    lat?: number;
    lng?: number;
    status: 'REPORTED' | 'CLOSED';
    violations?: number;
    violationType?: string;
    fineAmount?: number;
    finePaid?: boolean;
    orNumber?: string;
    paidAt?: string;
    remarks?: string;
    voided?: { at: string; reason: string };
  };
  const strays: StraySeed[] = [
    {
      // Tagged animal: the ear tag links the report to the animal and its owner.
      at: '2026-09-20T09:36:00',
      species: 'Carabao',
      earTag: 'ET-2404',
      animalId: 4,
      ownerId: 1,
      barangay: 'Carolina',
      location: 'Carolina–Panicuason road, near chapel',
      description: 'Male carabao wandering on the road, rope broken. Reported by a tricycle driver.',
      lat: 13.6655,
      lng: 123.2731,
      status: 'REPORTED',
      violations: 1,
      violationType: 'Animal on a public road or highway',
      fineAmount: 500,
      finePaid: false,
      remarks: 'Owner informed by phone; to pay the fine.',
    },
    {
      at: '2026-09-24T09:36:00',
      species: 'Goat',
      ownerId: 10,
      barangay: 'Pacol',
      location: 'Pacol elementary school grounds',
      description: 'Two goats grazing inside the school grounds. Owner identified by the barangay.',
      status: 'REPORTED',
      violationType: 'Stray / roaming animal',
    },
    {
      at: '2026-09-28T09:36:00',
      species: 'Carabao',
      ownerId: 11,
      barangay: 'San Felipe',
      location: 'San Felipe rice fields, Zone 3',
      description: 'Carabao entered a neighbour’s rice field and damaged about 200 m² of palay.',
      lat: 13.6425,
      lng: 123.2101,
      status: 'CLOSED',
      violations: 1,
      violationType: 'Damage to crops or property',
      fineAmount: 1000,
      finePaid: true,
      orNumber: 'OR-7712345',
      paidAt: '2026-10-01',
    },
    {
      at: '2026-10-02T09:36:00',
      species: 'Swine',
      ownerId: 12,
      barangay: 'Cararayan',
      location: 'Cararayan public market',
      description: 'Sow roaming at the market entrance. Second time this year.',
      lat: 13.6372,
      lng: 123.2359,
      status: 'CLOSED',
      violations: 2,
      violationType: 'Repeat offense',
      fineAmount: 1500,
      finePaid: true,
      orNumber: 'OR-7712398',
      paidAt: '2026-10-03',
      remarks: 'Owner warned in writing; pen fence repaired. Case closed.',
    },
    {
      // Recent, owner not known yet (no ear tag).
      at: `${ago(3)}T07:15:00`,
      species: 'Cattle',
      barangay: 'Concepcion Grande',
      location: 'Concepcion Grande–Del Rosario road, near the bridge',
      description: 'Brown heifer without an ear tag tied to a post by residents. Owner unknown.',
      lat: 13.6171,
      lng: 123.2109,
      status: 'REPORTED',
      violationType: 'Unregistered or untagged animal',
    },
    {
      // The same heifer reported again by the barangay: voided, not deleted.
      at: `${ago(3)}T08:40:00`,
      species: 'Cattle',
      barangay: 'Concepcion Grande',
      location: 'Near the Concepcion Grande bridge',
      description: 'Stray cow on the road.',
      status: 'REPORTED',
      voided: { at: `${ago(2)}T10:00:00`, reason: 'Same heifer as STR-0005, reported twice' },
    },
  ];
  for (let i = 0; i < strays.length; i++) {
    const s = strays[i];
    await prisma.strayIncident.create({
      data: {
        code: code('STR', i + 1),
        discoveredAt: DT(s.at),
        species: s.species,
        earTag: s.earTag ?? null,
        animalId: s.animalId ?? null,
        ownerId: s.ownerId ?? null,
        barangay: s.barangay,
        location: s.location,
        description: s.description,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        status: s.status,
        violations: s.violations ?? 0,
        violationType: s.violationType ?? null,
        fineAmount: s.fineAmount ?? null,
        finePaid: s.finePaid ?? false,
        orNumber: s.orNumber ?? null,
        paidAt: s.paidAt ? D(s.paidAt) : null,
        remarks: s.remarks ?? null,
        voidedAt: s.voided ? DT(s.voided.at) : null,
        voidedBy: s.voided ? LIZA : null,
        voidReason: s.voided?.reason ?? null,
        createdBy: i % 2 ? JOY : MARK,
        createdAt: DT(s.at),
      },
    });
  }

  /* disease cases — every stage, with site visits, lab records and response measures */
  // Dates in visits, labs and measures: a number = days after the case was reported; a string = that date.
  type Day = number | string;
  type VisitSeed = {
    on: Day;
    type: 'INITIAL' | 'FOLLOW_UP' | 'TRACING' | 'FINAL';
    examined?: number;
    sick?: number;
    dead?: number;
    signs?: string;
    biosecurity?: string;
    actions?: string;
    samples?: boolean;
    next?: Day;
    notes: string;
  };
  type LabSeed = {
    sampleId: string;
    type: string;
    count: number;
    method: string;
    collected: Day;
    sent?: Day;
    ref?: string;
    result: 'PENDING' | 'POSITIVE' | 'NEGATIVE' | 'INCONCLUSIVE';
    resultOn?: Day;
    remarks?: string;
  };
  type ResponseSeed = {
    type: string;
    status?: 'PLANNED' | 'ONGOING' | 'COMPLETED';
    on: Day;
    end?: Day;
    location?: string;
    personnel?: string;
    remarks?: string;
    heads?: number;
    disposal?: string;
  };
  type CaseSeed = {
    farm: string;
    disease: string;
    species: Species;
    affected: number;
    deaths: number;
    reported: string;
    status: string;
    symptoms: string;
    by: 'MARK' | 'JOY' | null; // assigned inspector
    reportedBy?: string;
    reconciled?: number; // deaths and culled heads already taken off the head count (default: the deaths)
    related?: number; // linked case number
    steps?: Partial<Record<string, number>>; // days after reporting each status was reached
    visits?: VisitSeed[];
    labs?: LabSeed[];
    responses?: ResponseSeed[];
    closed?: { on: number; outcome: string; note: string };
    voided?: { on: number; reason: string };
  };
  const RADDL = 'RADDL Region V, Pili';
  const CASES: CaseSeed[] = [
    {
      // CASE-0001: confirmed ASF with every ASF response step done.
      farm: 'Ground Zero Piggery',
      disease: 'African Swine Fever (ASF)',
      species: 'Swine',
      affected: 10,
      deaths: 1,
      reported: '2026-08-31',
      status: 'POSITIVE',
      symptoms:
        'One grower died suddenly; others with high fever, not eating, reddish-purple ears and belly.',
      by: 'MARK',
      reportedBy: 'Juan Dela Cruz (owner)',
      reconciled: 10, // the death and the 9 culled pigs are already reflected in the head count
      visits: [
        {
          on: 1,
          type: 'INITIAL',
          examined: 40,
          sick: 10,
          dead: 1,
          signs:
            'High fever (41–42 °C), reddish-purple blotches on ears and belly, not eating, weak hind legs.',
          biosecurity: 'No footbath at the gate; kitchen leftovers (swill) fed; pig traders enter the pens.',
          actions:
            'Blood and spleen samples taken; owner told to stop selling or moving pigs; pens marked off.',
          samples: true,
          next: 3,
          notes: 'Owner interviewed: 5 weaners bought from a travelling trader two weeks ago.',
        },
        {
          on: 3,
          type: 'TRACING',
          actions: 'Traced the trader and visited 6 farms within 1 km; no sick pigs found.',
          next: 10,
          notes: 'Contact tracing of pig movements in the last 30 days.',
        },
        {
          on: 10,
          type: 'FOLLOW_UP',
          examined: 30,
          sick: 0,
          dead: 0,
          actions: 'Checked the burial pit and disinfection; quarantine notices posted at the gate.',
          notes: 'Affected pigs culled on day 9; premises disinfected. Remaining pigs show no signs.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-0901',
          type: 'Whole blood & spleen tissue',
          count: 6,
          method: 'PCR',
          collected: 1,
          sent: 2,
          ref: 'R5-26-0912',
          result: 'POSITIVE',
          resultOn: 7,
          remarks: 'ASF virus DNA detected.',
        },
      ],
      responses: [
        {
          type: 'OWNER_NOTIFICATION',
          on: 0,
          remarks: 'Owner and 6 neighbouring raisers within 1 km informed.',
        },
        {
          type: 'BARANGAY_COORDINATION',
          on: 1,
          location: 'Brgy. Cararayan hall',
          personnel: 'Dr. Mark Inspector, Barangay Captain, BAT',
          remarks: 'Barangay to watch for pig movements and report sick pigs.',
        },
        {
          type: 'QUARANTINE',
          on: 1,
          end: '2026-10-15',
          location: 'Ground Zero Piggery',
          remarks: 'Lifted after 30 days with no new cases nearby.',
        },
        {
          type: 'MOVEMENT_RESTRICTION',
          on: 1,
          end: '2026-10-15',
          location: '1 km zone around Ground Zero Piggery',
          remarks: 'No pigs or pork products in or out of the zone.',
        },
        {
          type: 'ASF_CHECKPOINT',
          on: 1,
          end: '2026-10-15',
          location: 'Cararayan–Pacol road junction',
          personnel: 'City Vet Team A, PNP Cararayan',
        },
        {
          type: 'CULLING_DEPOPULATION',
          on: 9,
          heads: 9,
          disposal: 'Burial',
          location: 'Ground Zero Piggery — burial pit 50 m from the pens',
          personnel: 'City Vet Team A, DA Region V',
          remarks: 'Owner gave written consent; indemnity papers filed with DA.',
        },
        {
          type: 'DISINFECTION',
          on: 10,
          location: 'Ground Zero Piggery pens and access road',
          remarks: 'Lime and disinfectant; repeated after 7 days.',
        },
      ],
    },
    {
      // CASE-0002: lab result negative.
      farm: 'Carolina Backyard',
      disease: 'Hog Cholera',
      species: 'Swine',
      affected: 12,
      deaths: 1,
      reported: '2026-09-04',
      status: 'NEGATIVE',
      symptoms: 'Fever, pigs huddling together, red eyes, constipation then diarrhea.',
      by: 'JOY',
      visits: [
        {
          on: 1,
          type: 'INITIAL',
          examined: 31,
          sick: 12,
          dead: 1,
          signs: 'Fever (40.5 °C), red eyes with discharge, huddling, constipation then diarrhea.',
          biosecurity: 'Pigs vaccinated against hog cholera in 2025; pens clean.',
          actions: 'Blood samples taken; sick pigs separated.',
          samples: true,
          notes: 'Owner suspects spoiled feed.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-0905',
          type: 'Whole blood',
          count: 5,
          method: 'ELISA',
          collected: 1,
          sent: 2,
          ref: 'R5-26-0931',
          result: 'NEGATIVE',
          resultOn: 7,
          remarks: 'No hog cholera antigen detected. Likely bacterial; treat with antibiotics.',
        },
      ],
      responses: [{ type: 'OWNER_NOTIFICATION', on: 0, remarks: 'Owner advised to keep sick pigs apart.' }],
    },
    {
      // CASE-0003: waiting for the lab; linked to CASE-0001 (same feed supplier, 500 m away).
      farm: 'Bagong Buhay Backyard',
      disease: 'African Swine Fever (ASF)',
      species: 'Swine',
      affected: 8,
      deaths: 2,
      reported: '2026-09-08',
      status: 'SENT_TO_LAB',
      symptoms: 'Two pigs died suddenly; others feverish with reddish skin.',
      by: 'MARK',
      related: 1,
      visits: [
        {
          on: 1,
          type: 'INITIAL',
          examined: 31,
          sick: 8,
          dead: 2,
          signs: 'Fever, reddish skin on ears, not eating, two found dead.',
          biosecurity: 'Shares a feed supplier with Ground Zero Piggery, 500 m away.',
          actions: 'Blood samples taken; precautionary quarantine.',
          samples: true,
          notes: 'Possible spread from CASE-0001.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-0909',
          type: 'Whole blood',
          count: 4,
          method: 'PCR',
          collected: 1,
          sent: 2,
          ref: 'R5-26-0944',
          result: 'PENDING',
        },
      ],
      responses: [
        { type: 'OWNER_NOTIFICATION', on: 0 },
        {
          type: 'QUARANTINE',
          status: 'ONGOING',
          on: 1,
          location: 'Bagong Buhay Backyard',
          remarks: 'Precautionary, until the lab result comes back.',
        },
        {
          type: 'ASF_CHECKPOINT',
          status: 'ONGOING',
          on: 2,
          location: 'Cararayan barangay road, near the chapel',
          personnel: 'City Vet Team B, Barangay tanods',
        },
      ],
    },
    {
      // CASE-0004: sample sent, result pending.
      farm: 'San Felipe Piggery',
      disease: 'Porcine Reproductive & Respiratory Syndrome',
      species: 'Swine',
      affected: 9,
      deaths: 2,
      reported: '2026-09-12',
      status: 'SENT_TO_LAB',
      symptoms: 'Coughing, fast breathing, two sows aborted, bluish ears.',
      by: 'MARK',
      visits: [
        {
          on: 1,
          type: 'INITIAL',
          examined: 40,
          sick: 9,
          dead: 2,
          signs: 'Coughing, laboured breathing, bluish ears, 2 abortions in late pregnancy.',
          biosecurity: 'Replacement gilts bought last month without quarantine.',
          actions: 'Serum samples taken; new gilts separated.',
          samples: true,
          notes: 'Owner keeps records of all pigs bought.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-0913',
          type: 'Serum',
          count: 6,
          method: 'PCR',
          collected: 1,
          sent: 2,
          result: 'PENDING',
        },
      ],
      responses: [{ type: 'OWNER_NOTIFICATION', on: 0 }],
    },
    {
      // CASE-0005: sample taken but not yet sent to the laboratory.
      farm: 'Carolina Cattle Range',
      disease: 'Peste des Petits Ruminants',
      species: 'Goat',
      affected: 6,
      deaths: 2,
      reported: '2026-09-16',
      status: 'SAMPLE_COLLECTED',
      symptoms: 'Runny nose and eyes, mouth sores, diarrhea, coughing.',
      by: 'JOY',
      visits: [
        {
          on: 1,
          type: 'INITIAL',
          examined: 8,
          sick: 6,
          dead: 2,
          signs: 'Nasal and eye discharge, sores in the mouth, diarrhea, coughing.',
          biosecurity: 'Goats share the pasture with the cattle.',
          actions: 'Nasal and eye swabs taken; sick goats kept apart from the cattle.',
          samples: true,
          notes: 'Two goats died before the visit.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-0917',
          type: 'Nasal & eye swabs',
          count: 6,
          method: 'PCR',
          collected: 1,
          result: 'PENDING',
          remarks: 'Waiting for a cold-chain box to send to RADDL.',
        },
      ],
      responses: [{ type: 'OWNER_NOTIFICATION', on: 0 }],
    },
    {
      // CASE-0006: suspected, no visit yet.
      farm: 'Mabolo Poultry',
      disease: 'Newcastle Disease',
      species: 'Chicken',
      affected: 10,
      deaths: 3,
      reported: '2026-09-20',
      status: 'SUSPECTED',
      symptoms: 'Twisted necks, greenish diarrhea, three found dead.',
      by: 'MARK',
    },
    {
      // CASE-0007: first sample inconclusive, re-sampled; measures ongoing, one late and one planned.
      farm: 'Panicuason Highland',
      disease: 'Foot and Mouth Disease (suspected)',
      species: 'Cattle',
      affected: 5,
      deaths: 1,
      reported: '2026-09-24',
      status: 'SENT_TO_LAB',
      symptoms: 'Drooling, blisters on the mouth and feet, limping, not eating.',
      by: 'JOY',
      visits: [
        {
          on: 1,
          type: 'INITIAL',
          examined: 14,
          sick: 5,
          dead: 1,
          signs: 'Blisters on tongue, gums and between the hooves; drooling; lameness.',
          biosecurity: 'Cattle graze on the shared foothill pasture with other herds.',
          actions: 'Vesicular fluid taken; farm and pasture placed under quarantine.',
          samples: true,
          notes: 'One calf died before the visit.',
        },
        {
          on: ago(7),
          type: 'FOLLOW_UP',
          examined: 14,
          sick: 3,
          dead: 0,
          signs: 'Lesions healing on 2 cattle; 3 still limping.',
          actions: 'New sample taken because the first one was inconclusive.',
          samples: true,
          next: ahead(7),
          notes: 'Owner keeping the herd off the shared pasture.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-0925',
          type: 'Vesicular fluid & epithelium',
          count: 3,
          method: 'PCR',
          collected: 1,
          sent: 2,
          ref: 'R5-26-0958',
          result: 'INCONCLUSIVE',
          resultOn: 11,
          remarks: 'Sample leaked in transit; please send a new sample.',
        },
        {
          sampleId: 'NCV-26-0925B',
          type: 'Vesicular fluid',
          count: 3,
          method: 'PCR',
          collected: ago(7),
          sent: ago(6),
          ref: 'R5-26-1107',
          result: 'PENDING',
        },
      ],
      responses: [
        { type: 'OWNER_NOTIFICATION', on: 0 },
        {
          type: 'QUARANTINE',
          status: 'ONGOING',
          on: 1,
          end: ahead(10),
          location: 'Panicuason Highland and its pasture',
        },
        {
          type: 'MOVEMENT_RESTRICTION',
          status: 'ONGOING',
          on: 1,
          end: ago(3),
          location: 'Panicuason, upper zones',
          remarks: 'No cattle, carabao, goats or pigs in or out.',
        },
        {
          type: 'DISINFECTION',
          status: 'PLANNED',
          on: ahead(2),
          location: 'Cattle pens and loading area',
          personnel: 'City Vet Team B',
        },
      ],
    },
    {
      // CASE-0008: suspected, no visit yet.
      farm: 'San Isidro Ranch',
      disease: 'Swine Erysipelas',
      species: 'Swine',
      affected: 10,
      deaths: 1,
      reported: '2026-09-28',
      status: 'SUSPECTED',
      symptoms: 'Diamond-shaped red patches on the skin, fever, lameness.',
      by: 'MARK',
    },
    {
      // CASE-0009: the farm has no map location, so the case has none either.
      farm: 'Pacol Carabao Yard',
      disease: 'Hemorrhagic Septicemia (suspected)',
      species: 'Carabao',
      affected: 2,
      deaths: 1,
      reported: '2026-10-07',
      status: 'SUSPECTED',
      symptoms: 'Swollen throat, difficult breathing, high fever.',
      by: 'JOY',
    },
    {
      // CASE-0010 + CASE-0011: two recent cases in Del Rosario make it a hotspot.
      farm: 'Del Rosario Poultry',
      disease: 'Newcastle Disease',
      species: 'Chicken',
      affected: 30,
      deaths: 6,
      reported: ago(16),
      status: 'SENT_TO_LAB',
      symptoms: 'Twisted necks, greenish diarrhea, fewer eggs, sudden deaths.',
      by: 'JOY',
      reportedBy: 'Manuel Belmonte (owner)',
      reconciled: 0, // dead and culled birds not yet taken off the head count
      visits: [
        {
          on: 1,
          type: 'INITIAL',
          examined: 176,
          sick: 30,
          dead: 6,
          signs: 'Twisted necks, paralysis, greenish watery droppings, egg production down by half.',
          biosecurity: 'Free-range; wild birds share the feeders; no footbath.',
          actions: 'Tracheal and cloacal swabs taken; 20 very sick birds culled.',
          samples: true,
          next: ahead(1),
          notes: 'Owner bought 30 ready-to-lay pullets at a market 3 weeks ago.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-DR01',
          type: 'Tracheal & cloacal swabs',
          count: 10,
          method: 'PCR',
          collected: 1,
          sent: 2,
          ref: 'R5-26-1121',
          result: 'PENDING',
        },
      ],
      responses: [
        { type: 'OWNER_NOTIFICATION', on: 0 },
        {
          type: 'CULLING_DEPOPULATION',
          on: 1,
          heads: 20,
          disposal: 'Burning / incineration',
          location: 'Del Rosario Poultry',
          personnel: 'Dr. Joy Inspector, owner',
        },
        {
          type: 'BARANGAY_COORDINATION',
          on: 2,
          location: 'Brgy. Del Rosario hall',
          remarks: 'Barangay to report sick birds; ring vaccination being arranged.',
        },
        {
          type: 'QUARANTINE',
          status: 'ONGOING',
          on: 1,
          end: ahead(14),
          location: 'Del Rosario Poultry',
        },
      ],
    },
    {
      // CASE-0011: just reported, not assigned yet, no visit yet.
      farm: 'Belmonte Mixed Farm',
      disease: 'Hog Cholera',
      species: 'Swine',
      affected: 4,
      deaths: 1,
      reported: ago(4),
      status: 'SUSPECTED',
      symptoms: 'Fever, not eating, purple ear tips; one pig died.',
      by: null,
    },
    {
      // CASE-0012: the full cycle — confirmed, treated, vaccinated, final inspection, closed.
      farm: 'Isarog Foothill Farm',
      disease: 'Hemorrhagic Septicemia',
      species: 'Cattle',
      affected: 3,
      deaths: 0,
      reported: ago(52),
      status: 'POSITIVE',
      symptoms: 'High fever, swollen throat, drooling, difficult breathing.',
      by: 'JOY',
      steps: { SAMPLE_COLLECTED: 0, SENT_TO_LAB: 1, POSITIVE: 7 },
      visits: [
        {
          on: 0,
          type: 'INITIAL',
          examined: 9,
          sick: 3,
          dead: 0,
          signs: 'Fever (41 °C), hot swelling under the jaw, drooling, noisy breathing.',
          biosecurity: 'Herd not vaccinated against HS this year.',
          actions: 'Nasal swabs and blood taken; the 3 sick cattle treated with oxytetracycline.',
          samples: true,
          next: 12,
          notes: 'Heavy rains last week; cattle were moved to wet low ground.',
        },
        {
          on: 12,
          type: 'FOLLOW_UP',
          examined: 9,
          sick: 1,
          dead: 0,
          signs: 'Two recovered; one still with mild swelling.',
          actions: 'Treatment continued; herd vaccinated (Hemosep).',
          next: 31,
          notes: 'Owner following the treatment schedule.',
        },
        {
          on: 31,
          type: 'FINAL',
          examined: 9,
          sick: 0,
          dead: 0,
          actions: 'Quarantine lifted.',
          notes: 'All cattle healthy; no new cases for 3 weeks.',
        },
      ],
      labs: [
        {
          sampleId: 'NCV-26-IS01',
          type: 'Nasal swabs & whole blood',
          count: 3,
          method: 'Bacterial culture',
          collected: 0,
          sent: 1,
          ref: 'R5-26-1003',
          result: 'POSITIVE',
          resultOn: 6,
          remarks: 'Pasteurella multocida isolated.',
        },
      ],
      responses: [
        { type: 'OWNER_NOTIFICATION', on: 0 },
        { type: 'QUARANTINE', on: 1, end: 31, location: 'Isarog Foothill Farm' },
        { type: 'DISINFECTION', on: 2, location: 'Cattle shed and water trough' },
        {
          type: 'SURVEILLANCE_VISIT',
          on: 14,
          location: '4 cattle farms within 1 km',
          personnel: 'Dr. Joy Inspector',
          remarks: 'No sick cattle found.',
        },
      ],
      closed: {
        on: 32,
        outcome: 'RESOLVED',
        note: 'All 3 sick cattle recovered after treatment; herd vaccinated (SRV-0028); no new cases for 3 weeks.',
      },
    },
    {
      // CASE-0013: the same report entered twice — voided, kept for the record, not counted.
      farm: 'Belmonte Mixed Farm',
      disease: 'Hog Cholera',
      species: 'Swine',
      affected: 4,
      deaths: 1,
      reported: ago(4),
      status: 'SUSPECTED',
      symptoms: 'Pigs with fever, one dead.',
      by: 'MARK',
      related: 11,
      voided: { on: 1, reason: 'Duplicate of CASE-0011, reported twice by the barangay' },
    },
  ];
  const ORDER = ['SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB', 'POSITIVE'] as const;
  const STEP_DAYS: Record<string, number> = {
    SUSPECTED: 0,
    SAMPLE_COLLECTED: 1,
    SENT_TO_LAB: 2,
    POSITIVE: 8,
    NEGATIVE: 8,
  };
  const STEP_NOTES: Record<string, string> = {
    SUSPECTED: 'Case reported',
    SAMPLE_COLLECTED: 'Samples collected during the site visit',
    SENT_TO_LAB: 'Samples sent to RADDL',
    POSITIVE: 'Laboratory confirmed: positive',
    NEGATIVE: 'Laboratory result: negative',
  };
  const addDays = (s: string, n: number) => {
    const d = D(s);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const userId = (who: 'MARK' | 'JOY' | null) =>
    who === 'MARK' ? users[1].id : who === 'JOY' ? users[2].id : null;
  const nameOf = (who: 'MARK' | 'JOY' | null) => (who === 'JOY' ? JOY : MARK);
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const day = (x: Day) => (typeof x === 'number' ? addDays(c.reported, x) : x);
    const farm = farmByName(c.farm);
    const owner = owners.find((o) => o.id === farm.ownerId)!;
    const inspector = nameOf(c.by);
    const closedAt = c.closed
      ? DT(`${day(c.closed.on)}T15:00:00`)
      : c.voided
        ? DT(`${day(c.voided.on)}T09:00:00`)
        : null;
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
        populationReconciled: c.reconciled ?? c.deaths,
        symptomsDate: D(addDays(c.reported, -2)),
        reportedAt: D(c.reported),
        symptoms: c.symptoms,
        reportedBy: c.reportedBy ?? 'Barangay Agricultural Technician',
        assignedToId: userId(c.by),
        sampleInfo: c.labs?.[0] ? `${c.labs[0].type} (${c.labs[0].count})` : null,
        lat: farm.lat,
        lng: farm.lng,
        locationSource: farm.lat != null ? 'Farm Coordinates' : null,
        status: c.status as any,
        relatedCaseId: c.related ?? null,
        closedAt,
        closedBy: c.closed || c.voided ? LIZA : null,
        closureNote: c.closed ? c.closed.note : c.voided ? `Voided: ${c.voided.reason}` : null,
        closureOutcome: c.closed ? c.closed.outcome : c.voided ? 'OTHER' : null,
        voidedAt: c.voided ? closedAt : null,
        voidedBy: c.voided ? LIZA : null,
        voidReason: c.voided?.reason ?? null,
        createdAt: DT(`${c.reported}T08:33:00`),
      },
    });

    // Status history through to the current status, then closing or voiding.
    const path: string[] =
      c.status === 'NEGATIVE'
        ? [...ORDER.slice(0, 4), 'NEGATIVE']
        : ORDER.slice(0, ORDER.indexOf(c.status as any) + 1);
    for (const s of path)
      await prisma.caseStatusHistory.create({
        data: {
          caseId: created.id,
          status: s as any,
          note: STEP_NOTES[s],
          byName: s === 'POSITIVE' || s === 'NEGATIVE' ? LIZA : inspector,
          at: DT(
            `${addDays(c.reported, c.steps?.[s] ?? STEP_DAYS[s])}T${s === 'SUSPECTED' ? '08:33' : '16:00'}:00`,
          ),
        },
      });
    if (c.closed)
      await prisma.caseStatusHistory.create({
        data: {
          caseId: created.id,
          status: c.status as any,
          note: `Case closed — ${c.closed.outcome === 'RESOLVED' ? 'Resolved — animals recovered' : c.closed.outcome}. ${c.closed.note}`,
          byName: LIZA,
          at: closedAt!,
        },
      });
    if (c.voided)
      await prisma.caseStatusHistory.create({
        data: {
          caseId: created.id,
          status: c.status as any,
          note: `Case voided: ${c.voided.reason}`,
          byName: LIZA,
          at: closedAt!,
        },
      });

    // Activity feed on the dashboard.
    const logs: [string, string, string, Date][] = [
      [
        'reported',
        `Disease case ${created.code} reported (${c.disease})`,
        inspector,
        DT(`${c.reported}T08:33:00`),
      ],
    ];
    if (c.status === 'POSITIVE')
      logs.push([
        'status',
        `${created.code} confirmed POSITIVE — ${c.disease}`,
        LIZA,
        DT(`${addDays(c.reported, c.steps?.POSITIVE ?? STEP_DAYS.POSITIVE)}T16:00:00`),
      ]);
    if (c.closed)
      logs.push(['closed', `${created.code} closed — ${c.closed.outcome.toLowerCase()}`, LIZA, closedAt!]);
    if (c.voided) logs.push(['voided', `${created.code} voided: ${c.voided.reason}`, LIZA, closedAt!]);
    for (const [action, summary, byName, createdAt] of logs)
      await prisma.activityLog.create({
        data: { entity: 'case', entityId: created.id, action, summary, byName, createdAt },
      });

    for (const v of c.visits ?? [])
      await prisma.investigation.create({
        data: {
          caseId: created.id,
          date: D(day(v.on)),
          investigator: inspector,
          visitType: v.type,
          animalsExamined: v.examined ?? null,
          sickCount: v.sick ?? null,
          deadCount: v.dead ?? null,
          clinicalSigns: v.signs ?? null,
          biosecurity: v.biosecurity ?? null,
          actionsTaken: v.actions ?? null,
          samplesCollected: v.samples ?? false,
          nextVisit: v.next != null ? D(day(v.next)) : null,
          notes: v.notes,
        },
      });
    for (const l of c.labs ?? [])
      await prisma.labRecord.create({
        data: {
          caseId: created.id,
          sampleId: l.sampleId,
          sampleType: l.type,
          sampleCount: l.count,
          testMethod: l.method,
          collectedAt: D(day(l.collected)),
          laboratory: RADDL,
          labReference: l.ref ?? null,
          submittedBy: inspector,
          sentAt: l.sent != null ? D(day(l.sent)) : null,
          result: l.result,
          resultDate: l.resultOn != null ? D(day(l.resultOn)) : null,
          remarks: l.remarks ?? null,
        },
      });
    for (const r of c.responses ?? [])
      await prisma.responseActivity.create({
        data: {
          caseId: created.id,
          type: r.type,
          status: r.status ?? 'COMPLETED',
          date: D(day(r.on)),
          endDate: r.end != null ? D(day(r.end)) : null,
          location: r.location ?? null,
          personnel: r.personnel ?? inspector,
          remarks: r.remarks ?? null,
          heads: r.heads ?? null,
          disposalMethod: r.disposal ?? null,
        },
      });
  }

  /* vaccinations — 27 earlier records, then recent ones with doses coming up and one voided */
  // date, vaccine, farm, target, groupSpecies|animalCode, count, dose, next dose, remarks, void reason
  type V = [string, string, string, 'G' | 'A', string, number, number, string | null, string?, string?];
  const HC = 'Hog Cholera Vaccine';
  const NCD = 'NCD Vaccine';
  const HS = 'Hemosep Vaccine';
  const VAX: V[] = [
    ['2026-08-10', HC, 'Ground Zero Piggery', 'G', 'Swine', 28, 1, '2026-09-12'],
    ['2026-09-12', HC, 'Ground Zero Piggery', 'G', 'Swine', 26, 2, null],
    ['2026-08-11', NCD, 'Ground Zero Piggery', 'G', 'Chicken', 104, 1, null],
    ['2026-08-12', HC, 'Cararayan Hog Farm', 'G', 'Swine', 28, 1, null],
    ['2026-08-13', NCD, 'Cararayan Hog Farm', 'G', 'Chicken', 61, 1, ago(6)], // overdue
    ['2026-08-14', HC, 'Bagong Buhay Backyard', 'G', 'Swine', 22, 1, null],
    ['2026-09-12', HC, 'Bagong Buhay Backyard', 'G', 'Swine', 20, 2, null],
    ['2026-08-15', NCD, 'Bagong Buhay Backyard', 'G', 'Chicken', 70, 1, null],
    ['2026-08-16', HC, 'Riverside Swine', 'G', 'Swine', 18, 1, ago(2)], // overdue
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
    [ago(40), HS, 'Isarog Foothill Farm', 'G', 'Cattle', 9, 1, null, 'Whole herd, after CASE-0012'],
    [ago(25), HC, 'Concepcion Backyard', 'G', 'Swine', 20, 1, ahead(10)],
    [ago(20), HS, 'Carolina Cattle Range', 'A', 'NC-C-0007', 1, 1, ahead(5), 'Insured animal (PCIC)'],
    [
      ago(18),
      NCD,
      'Pacol Poultry House',
      'G',
      'Chicken',
      150,
      1,
      ahead(3),
      'Ring vaccination near CASE-0010',
    ],
    [
      ago(18),
      NCD,
      'Pacol Poultry House',
      'G',
      'Chicken',
      150,
      1,
      ahead(3),
      'Ring vaccination near CASE-0010',
      'Duplicate of SRV-0031 (saved twice)',
    ],
  ];
  for (let i = 0; i < VAX.length; i++) {
    const [date, vaccine, farmName, t, ref, count, dose, next, remarks, voidReason] = VAX[i];
    const farm = farmByName(farmName);
    const group = t === 'G' ? groupOf(farmName, ref) : null;
    const animal = t === 'A' ? animals.find((a) => a.code === ref)! : null;
    await prisma.vaccination.create({
      data: {
        code: code('SRV', i + 1),
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
        remarks: remarks ?? null,
        voidedAt: voidReason ? DT(`${addDays(date, 1)}T09:00:00`) : null,
        voidedBy: voidReason ? LIZA : null,
        voidReason: voidReason ?? null,
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
        status: 'CLAIMED',
        remarks: 'ASF claim for 10 pigs (CASE-0001): filed 2026-09-12, paid 2026-10-20.',
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
        remarks: 'Not renewed',
      },
      {
        // Ends soon: shows the expiry warning.
        ownerId: 13,
        policyNo: 'PCIC-LV-2025-01042',
        species: 'Cattle',
        heads: 12,
        amountCovered: 480000,
        startDate: D(ago(345)),
        endDate: D(ahead(20)),
        status: 'ACTIVE',
        remarks: 'Owner reminded to renew',
      },
    ],
  });
  // Insured ear tags: two of Ramon Mendoza's tagged cattle are named on his cattle policy.
  await prisma.pcicPolicy.update({
    where: { id: 3 },
    data: {
      animals: {
        connect: ['NC-C-0007', 'NC-C-0008'].map((c) => ({ id: animals.find((a) => a.code === c)!.id })),
      },
    },
  });

  /* this year's vaccination targets (Reports & Analytics) */
  const year = new Date().getFullYear();
  await prisma.setting.create({
    data: {
      key: `vaccinationTargets:${year}`,
      value: JSON.stringify([
        { vaccine: HC, species: 'Swine', target: 240 },
        { vaccine: NCD, species: 'Chicken', target: 800 },
        { vaccine: HS, species: 'Cattle', target: 40 },
        { vaccine: HS, species: 'Carabao', target: 12 },
      ]),
    },
  });

  const total = await prisma.populationGroup.aggregate({ _sum: { count: true } });
  console.log(
    `Done: ${owners.length + 1} owners, ${farms.length + 1} farms, ${groupId} groups (${total._sum.count} head), ${animals.length} animals, ${CASES.length} cases, ${VAX.length} vaccinations, ${strays.length} stray reports.`,
  );
  console.log('Sign in with admin@nagacityvet.gov.ph / Livestock@2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
