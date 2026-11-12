/**
 * Demo data for the defense: a small set with ONE complete example of every form and feature.
 * 8 owners (1 archived), 11 farms (1 archived), 6 tagged animals, 7 cases (1 voided), deworming,
 * check-ups and vaccinations (1 voided), farm visits (incl. monitoring around the ASF case), head counts
 * classified by age, sex and stage, 5 stray reports (1 voided), 4 PCIC policies and vaccination targets.
 * All dates are counted back from the day you seed, so seed again the day before the demo.
 * Run with: pnpm db:seed         (WIPES the database, loads the demo data)
 *           pnpm db:seed:empty   (WIPES the database, keeps only the 4 login accounts)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {
  CLASSIFICATIONS,
  SPECIES_ID_LETTER,
  addMonths,
  code,
  isoDate,
  isoMonth,
  type Species,
} from '@livestock/shared';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { adapterFromUrl } from '../src/lib/adapter.ts';

// Same fallback as prisma.config.ts, so seeding works even before apps/api/.env exists.
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
const RADDL = 'RADDL Region V, Pili';
const HC = 'Hog Cholera Vaccine';
const NCD = 'NCD Vaccine';
const HS = 'Hemosep Vaccine';

/* ------------------------------ owners ------------------------------ */
// name, barangay, zone, RSBSA number, remarks
const OWNERS: [string, string, string, string | null, string | null][] = [
  [
    'Juan Dela Cruz',
    'Cararayan',
    'Zone 1',
    '05-17-24-100-000',
    'President, Cararayan Hog Raisers Association',
  ],
  ['Maria Santos', 'Cararayan', 'Zone 2', null, null],
  ['Ramon Mendoza', 'Carolina', 'Zone 7', '05-17-24-106-006', 'Tends the communal pasture in upper Carolina'],
  ['Elena Ramos', 'Carolina', 'Zone 1', null, null],
  ['Luz Navarro', 'Pacol', 'Zone 3', '05-17-24-109-000', null],
  ['Manuel Belmonte', 'Del Rosario', 'Zone 6', '05-17-24-112-003', 'Prefers calls after 4 PM'],
  ['Teresa Garcia', 'Cararayan', 'Zone 5', null, null],
];

/* ------------------------------ farms ------------------------------ */
type FarmSeed = {
  name: string;
  owner: number; // 1-based
  type: string;
  lat: number | null;
  lng: number | null;
  status: 'verified' | 'overdue' | 'outdated'; // how up to date the monthly head count is
  groups: [Species, number, string][]; // species, head count, breed
  pasture?: [number, string, number, number]; // hectares, location, lat, lng
  remarks?: string;
};
const FARMS: FarmSeed[] = [
  {
    name: 'Ground Zero Piggery',
    owner: 1,
    type: 'commercial',
    lat: 13.638,
    lng: 123.238,
    status: 'verified',
    groups: [
      ['Swine', 30, 'Large White'],
      ['Chicken', 148, 'Native'],
    ],
    remarks: 'ASF confirmed (CASE-0001). No restocking until cleared by the City Vet.',
  },
  {
    name: 'Cararayan Hog Farm',
    owner: 2,
    type: 'backyard',
    lat: 13.639775,
    lng: 123.238665,
    status: 'overdue',
    groups: [
      ['Swine', 40, 'Large White'],
      ['Chicken', 87, 'Native'],
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
      ['Goat', 16, 'Native'],
    ],
    pasture: [4, 'Communal grazing land, Sitio Kinalabasahan, Cararayan', 13.6521, 123.2547],
  },
  {
    name: 'Carolina Cattle Range',
    owner: 3,
    type: 'commercial',
    lat: 13.6672,
    lng: 123.2768,
    status: 'verified',
    groups: [
      ['Cattle', 14, 'Brahman'],
      ['Carabao', 7, 'Philippine Carabao'],
    ],
    pasture: [6.5, 'Mt. Isarog foothills grazing area, upper Carolina', 13.6735, 123.2851],
  },
  {
    name: 'Isarog Foothill Farm',
    owner: 4,
    type: 'backyard',
    lat: 13.6705,
    lng: 123.2841,
    status: 'verified',
    groups: [
      ['Swine', 38, 'Large White'],
      ['Cattle', 9, 'Brahman'],
    ],
  },
  {
    name: 'Pacol Poultry House',
    owner: 5,
    type: 'backyard',
    lat: 13.6528,
    lng: 123.2275,
    status: 'outdated',
    groups: [['Chicken', 158, 'Native']],
  },
  {
    name: 'Pacol Carabao Yard',
    owner: 5,
    type: 'backyard',
    lat: null,
    lng: null,
    status: 'verified',
    groups: [['Carabao', 3, 'Philippine Carabao']],
    remarks: 'Owner could not give the exact location; pin it on the next visit.',
  },
  {
    name: 'Del Rosario Poultry',
    owner: 6,
    type: 'commercial',
    lat: 13.6128,
    lng: 123.2197,
    status: 'verified',
    groups: [['Chicken', 176, 'Native']],
  },
  {
    name: 'Belmonte Mixed Farm',
    owner: 6,
    type: 'backyard',
    lat: 13.6151,
    lng: 123.2228,
    status: 'overdue',
    groups: [
      ['Swine', 25, 'Large White'],
      ['Goat', 14, 'Native'],
    ],
  },
  {
    name: 'Garcia Backyard',
    owner: 7,
    type: 'backyard',
    lat: 13.63304,
    lng: 123.2389,
    status: 'verified',
    groups: [['Swine', 12, 'Native']],
  },
];

/* ------------------------------ tagged animals ------------------------------ */
type AnimalSeed = {
  farm: string;
  species: Species;
  breed: string;
  sex: string;
  age?: string;
  dob?: string;
  markings: string;
  cowlick?: string; // asked only for cattle and carabao
  status?: 'SOLD' | 'DECEASED';
  remarks?: string;
};
const ANIMALS: AnimalSeed[] = [
  // NC-C-0001: bought from Juan Dela Cruz (see transfers); insured.
  {
    farm: 'Carolina Cattle Range',
    species: 'Cattle',
    breed: 'Brahman',
    sex: 'Female',
    age: '3 yrs',
    markings: 'Dark brown, notched left ear',
    cowlick: 'Cowlick on right shoulder',
  },
  // NC-K-0002: the stray carabao (open, fine unpaid); a transfer that was reversed.
  {
    farm: 'Hillside Ranch',
    species: 'Carabao',
    breed: 'Philippine Carabao',
    sex: 'Male',
    age: '6 yrs',
    markings: 'Black, broken right horn tip',
    cowlick: 'Cowlick on left flank',
  },
  // NC-C-0003: insured, booster dose due soon.
  {
    farm: 'Carolina Cattle Range',
    species: 'Cattle',
    breed: 'Brahman',
    sex: 'Male',
    age: '5 yrs',
    markings: 'Dark grey, ear notch right',
    cowlick: 'Cowlick on back',
  },
  // NC-G-0004: a goat — date of birth instead of an age, no cowlick.
  {
    farm: 'Hillside Ranch',
    species: 'Goat',
    breed: 'Native',
    sex: 'Female',
    dob: '2024-03-15',
    markings: 'White with brown head, ear tag on right ear',
    remarks: 'Breeder doe, kidded twice',
  },
  {
    farm: 'Isarog Foothill Farm',
    species: 'Cattle',
    breed: 'Brahman',
    sex: 'Female',
    age: '8 yrs',
    markings: 'Red, white patch on left flank',
    cowlick: 'Cowlick on forehead',
    status: 'DECEASED',
    remarks: 'Died of old age; carcass buried on the farm (reported by owner)',
  },
  {
    farm: 'Carolina Cattle Range',
    species: 'Carabao',
    breed: 'Philippine Carabao',
    sex: 'Male',
    age: '9 yrs',
    markings: 'Dark grey, long swept-back horns',
    cowlick: 'Whorl on right shoulder',
    status: 'SOLD',
    remarks: 'Sold to a buyer in Pili, Camarines Sur (outside the city)',
  },
];

/* ------------------------------ disease cases ------------------------------ */
// Dates in visits, labs and measures: a number = days after the case was reported; a string = that date.
type Day = number | string;
type Who = 'MARK' | 'JOY' | null;
type CaseSeed = {
  farm: string;
  disease: string;
  species: Species;
  affected: number;
  deaths: number;
  reported: number; // days ago
  status: 'SUSPECTED' | 'SAMPLE_COLLECTED' | 'SENT_TO_LAB' | 'POSITIVE' | 'NEGATIVE';
  symptoms: string;
  by: Who; // assigned inspector
  reportedBy?: string;
  reconciled?: number; // dead + culled already taken off the head count (default: the deaths)
  related?: number; // linked case number
  noLocation?: boolean;
  visits?: {
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
  }[];
  labs?: {
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
  }[];
  measures?: {
    type: string;
    status?: 'PLANNED' | 'ONGOING' | 'COMPLETED';
    on: Day;
    end?: Day;
    location?: string;
    personnel?: string;
    remarks?: string;
    heads?: number;
    disposal?: string;
  }[];
  closed?: { on: number; outcome: string; label: string; note: string };
  voided?: { on: number; reason: string };
};
const CASES: CaseSeed[] = [
  {
    // CASE-0001: confirmed ASF, every ASF response step done — next step is "Close the case".
    farm: 'Ground Zero Piggery',
    disease: 'African Swine Fever (ASF)',
    species: 'Swine',
    affected: 10,
    deaths: 1,
    reported: 60,
    status: 'POSITIVE',
    symptoms: 'One grower died suddenly; others with high fever, not eating, reddish-purple ears and belly.',
    by: 'MARK',
    reportedBy: 'Juan Dela Cruz (owner)',
    reconciled: 10, // the death and the 9 culled pigs are already off the head count
    visits: [
      {
        on: 1,
        type: 'INITIAL',
        examined: 40,
        sick: 10,
        dead: 1,
        signs: 'High fever (41–42 °C), reddish-purple blotches on ears and belly, not eating.',
        biosecurity: 'No footbath at the gate; kitchen leftovers (swill) fed; pig traders enter the pens.',
        actions: 'Blood and spleen samples taken; owner told to stop selling or moving pigs.',
        samples: true,
        next: 3,
        notes: 'Owner bought 5 weaners from a travelling trader two weeks ago.',
      },
      {
        on: 3,
        type: 'TRACING',
        actions: 'Traced the trader and visited the farms within 1 km; no sick pigs found.',
        next: 10,
        notes: 'Contact tracing of pig movements in the last 30 days.',
      },
      {
        on: 10,
        type: 'FOLLOW_UP',
        examined: 30,
        sick: 0,
        dead: 0,
        actions: 'Checked the burial pit and disinfection; quarantine notice posted at the gate.',
        notes: 'Affected pigs culled on day 9. Remaining pigs show no signs.',
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
    measures: [
      { type: 'OWNER_NOTIFICATION', on: 0, remarks: 'Owner and neighbouring raisers within 1 km informed.' },
      {
        type: 'BARANGAY_COORDINATION',
        on: 1,
        location: 'Brgy. Cararayan hall',
        personnel: 'Dr. Mark Inspector, Barangay Captain, BAT',
      },
      { type: 'QUARANTINE', on: 1, end: 40, location: 'Ground Zero Piggery' },
      { type: 'MOVEMENT_RESTRICTION', on: 1, end: 40, location: '1 km zone around Ground Zero Piggery' },
      {
        type: 'ASF_CHECKPOINT',
        on: 1,
        end: 40,
        location: 'Cararayan–Pacol road junction',
        personnel: 'City Vet Team A, PNP Cararayan',
      },
      {
        type: 'CULLING_DEPOPULATION',
        on: 9,
        heads: 9,
        disposal: 'Burial',
        location: 'Burial pit 50 m from the pens',
        personnel: 'City Vet Team A, DA Region V',
        remarks: 'Owner gave written consent; indemnity papers filed with DA.',
      },
      {
        type: 'DISINFECTION',
        on: 10,
        location: 'Pens and access road',
        remarks: 'Lime and disinfectant; repeated after 7 days.',
      },
    ],
  },
  {
    // CASE-0002: first sample inconclusive, re-sampled; quarantine on, one measure late, one planned.
    farm: 'Carolina Cattle Range',
    disease: 'Foot and Mouth Disease (FMD)',
    species: 'Cattle',
    affected: 5,
    deaths: 1,
    reported: 35,
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
    measures: [
      { type: 'OWNER_NOTIFICATION', on: 0 },
      {
        type: 'QUARANTINE',
        status: 'ONGOING',
        on: 1,
        end: ahead(10),
        location: 'Carolina Cattle Range and its pasture',
      },
      {
        type: 'MOVEMENT_RESTRICTION',
        status: 'ONGOING',
        on: 1,
        end: ago(3), // should have ended: shows as late
        location: 'Carolina, upper zones',
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
    // CASE-0003 + CASE-0004: two recent cases in Del Rosario make it a disease hotspot.
    farm: 'Del Rosario Poultry',
    disease: 'Newcastle Disease',
    species: 'Chicken',
    affected: 30,
    deaths: 6,
    reported: 12,
    status: 'SENT_TO_LAB',
    symptoms: 'Twisted necks, greenish diarrhea, fewer eggs, sudden deaths.',
    by: 'JOY',
    reportedBy: 'Manuel Belmonte (owner)',
    reconciled: 0, // 6 dead + 20 culled still on the head count: shows in My tasks
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
    measures: [
      { type: 'OWNER_NOTIFICATION', on: 0 },
      {
        type: 'CULLING_DEPOPULATION',
        on: 1,
        heads: 20,
        disposal: 'Burning / incineration',
        location: 'Del Rosario Poultry',
      },
      { type: 'QUARANTINE', status: 'ONGOING', on: 1, end: ahead(14), location: 'Del Rosario Poultry' },
    ],
  },
  {
    // CASE-0004: lab result negative; linked to CASE-0003 (same owner's neighbouring farm).
    farm: 'Belmonte Mixed Farm',
    disease: 'Classical Swine Fever (Hog Cholera)',
    species: 'Swine',
    affected: 4,
    deaths: 1,
    reported: 9,
    status: 'NEGATIVE',
    symptoms: 'Fever, pigs huddling together, red eyes, one died.',
    by: 'MARK',
    related: 3,
    visits: [
      {
        on: 0,
        type: 'INITIAL',
        examined: 25,
        sick: 4,
        dead: 1,
        signs: 'Fever (40.5 °C), red eyes with discharge, huddling.',
        biosecurity: 'Pigs vaccinated against hog cholera last year; pens clean.',
        actions: 'Blood samples taken; sick pigs separated.',
        samples: true,
        notes: 'Checked during the visit to the owner’s poultry farm.',
      },
    ],
    labs: [
      {
        sampleId: 'NCV-26-BM01',
        type: 'Whole blood',
        count: 4,
        method: 'ELISA',
        collected: 0,
        sent: 1,
        ref: 'R5-26-1130',
        result: 'NEGATIVE',
        resultOn: 6,
        remarks: 'No hog cholera antigen detected. Likely bacterial; treat with antibiotics.',
      },
    ],
    measures: [{ type: 'OWNER_NOTIFICATION', on: 0, remarks: 'Owner advised to keep sick pigs apart.' }],
  },
  {
    // CASE-0005: the full cycle — confirmed, treated, herd vaccinated, final inspection, closed.
    farm: 'Isarog Foothill Farm',
    disease: 'Hemorrhagic Septicemia',
    species: 'Cattle',
    affected: 3,
    deaths: 0,
    reported: 52,
    status: 'POSITIVE',
    symptoms: 'High fever, swollen throat, drooling, difficult breathing.',
    by: 'JOY',
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
        actions: 'Treatment continued; whole herd vaccinated (Hemosep).',
        next: 31,
        notes: 'Two recovered; one still with mild swelling.',
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
    measures: [
      { type: 'OWNER_NOTIFICATION', on: 0 },
      { type: 'QUARANTINE', on: 1, end: 31, location: 'Isarog Foothill Farm' },
      {
        type: 'SURVEILLANCE_VISIT',
        on: 14,
        location: 'Cattle farms within 1 km',
        remarks: 'No sick cattle found.',
      },
    ],
    closed: {
      on: 32,
      outcome: 'RESOLVED',
      label: 'Resolved — animals recovered',
      note: 'All 3 sick cattle recovered after treatment; herd vaccinated; no new cases for 3 weeks.',
    },
  },
  {
    // CASE-0006: just reported — not assigned, no visit yet, farm not on the map.
    farm: 'Pacol Carabao Yard',
    disease: 'Hemorrhagic Septicemia',
    species: 'Carabao',
    affected: 2,
    deaths: 0,
    reported: 2,
    status: 'SUSPECTED',
    symptoms: 'Swollen throat, difficult breathing, high fever.',
    by: null,
    noLocation: true,
  },
  {
    // CASE-0007: the same report entered twice — voided (kept for the record, not counted).
    farm: 'Pacol Carabao Yard',
    disease: 'Hemorrhagic Septicemia',
    species: 'Carabao',
    affected: 2,
    deaths: 0,
    reported: 2,
    status: 'SUSPECTED',
    symptoms: 'Sick carabao.',
    by: 'MARK',
    related: 6,
    noLocation: true,
    voided: { on: 1, reason: 'Duplicate of CASE-0006, reported twice by the barangay' },
  },
];

/* ------------------------------ vaccinations ------------------------------ */
// days ago, vaccine, farm, 'G' group (species) or 'A' animal (code), count, dose, next dose, remarks, void reason
type V = [number, string, string, 'G' | 'A', string, number, number, string | null, string?, string?];
const VAX: V[] = [
  [95, HC, 'Ground Zero Piggery', 'G', 'Swine', 28, 1, ago(65)],
  [65, HC, 'Ground Zero Piggery', 'G', 'Swine', 26, 2, null],
  [90, NCD, 'Ground Zero Piggery', 'G', 'Chicken', 104, 1, null],
  [80, NCD, 'Cararayan Hog Farm', 'G', 'Chicken', 61, 1, ago(5)], // overdue
  [85, HS, 'Hillside Ranch', 'G', 'Cattle', 8, 1, null],
  [85, HS, 'Hillside Ranch', 'A', 'NC-K-0002', 1, 1, null],
  [40, HS, 'Isarog Foothill Farm', 'G', 'Cattle', 9, 1, null, 'Whole herd, after CASE-0005'],
  [25, HC, 'Belmonte Mixed Farm', 'G', 'Swine', 20, 1, ahead(10)],
  [20, HS, 'Carolina Cattle Range', 'A', 'NC-C-0003', 1, 1, ahead(5), 'Insured animal (PCIC)'],
  [18, NCD, 'Pacol Poultry House', 'G', 'Chicken', 150, 1, ahead(3), 'Ring vaccination near CASE-0003'],
  [
    18,
    NCD,
    'Pacol Poultry House',
    'G',
    'Chicken',
    150,
    1,
    ahead(3),
    'Ring vaccination near CASE-0003',
    'Duplicate of SRV-0010 (saved twice)',
  ],
];

/* ------------------------------ deworming & check-ups ------------------------------ */
// days ago, service, farm, species (its group), heads, product, next schedule, remarks
type S = [
  number,
  'DEWORMING' | 'CHECKUP' | 'TREATMENT',
  string,
  Species,
  number,
  string | null,
  string | null,
  string?,
];
const SERVICES: S[] = [
  [6, 'DEWORMING', 'Hillside Ranch', 'Goat', 16, 'Albendazole', ahead(84)],
  [6, 'DEWORMING', 'Hillside Ranch', 'Cattle', 11, 'Ivermectin', ahead(84)],
  [6, 'DEWORMING', 'Hillside Ranch', 'Carabao', 7, 'Ivermectin', ahead(84)],
  [9, 'DEWORMING', 'Carolina Cattle Range', 'Carabao', 7, 'Ivermectin', ahead(81)],
  [4, 'DEWORMING', 'Belmonte Mixed Farm', 'Goat', 14, 'Albendazole', ahead(86)],
  [3, 'DEWORMING', 'Isarog Foothill Farm', 'Cattle', 9, 'Ivermectin', ahead(87)],
  [38, 'DEWORMING', 'Hillside Ranch', 'Goat', 15, 'Albendazole', null, 'Previous round'],
  [40, 'DEWORMING', 'Carolina Cattle Range', 'Cattle', 14, 'Levamisole', null, 'Previous round'],
  [70, 'DEWORMING', 'Belmonte Mixed Farm', 'Goat', 13, 'Albendazole', null, 'Previous round'],
  [5, 'CHECKUP', 'Garcia Backyard', 'Swine', 12, 'Vitamins (B-complex)', null],
  [8, 'CHECKUP', 'Cararayan Hog Farm', 'Swine', 40, null, null, 'All pigs checked; no signs of ASF'],
  [2, 'CHECKUP', 'Pacol Poultry House', 'Chicken', 158, 'Multivitamins', null],
  [35, 'CHECKUP', 'Isarog Foothill Farm', 'Swine', 38, null, null],
  [
    12,
    'TREATMENT',
    'Carolina Cattle Range',
    'Cattle',
    3,
    'Oxytetracycline',
    null,
    'Foot lesions treated (CASE-0002)',
  ],
];

/* ------------------------------ farm visits ------------------------------ */
// days ago, farm, purpose, findings, monitored case (id), remarks
type FV = [number, string, string, 'NO_SIGNS' | 'SICK_ANIMALS', number | null, string];
const VISITS: FV[] = [
  [6, 'Hillside Ranch', 'DEWORMING', 'NO_SIGNS', null, 'Goats, cattle and carabao dewormed; herd healthy.'],
  [
    9,
    'Carolina Cattle Range',
    'DEWORMING',
    'NO_SIGNS',
    null,
    'Carabao dewormed. Cattle still under watch for FMD.',
  ],
  [
    4,
    'Belmonte Mixed Farm',
    'DEWORMING',
    'NO_SIGNS',
    3,
    'Goats dewormed. Pigs checked near CASE-0003; no signs.',
  ],
  [3, 'Isarog Foothill Farm', 'DEWORMING', 'NO_SIGNS', null, 'Cattle dewormed.'],
  [5, 'Garcia Backyard', 'CHECKUP', 'NO_SIGNS', null, 'Pigs checked; vitamins given.'],
  [
    8,
    'Cararayan Hog Farm',
    'MONITORING',
    'NO_SIGNS',
    1,
    'Within 1 km of the ASF case. All pigs checked; no signs.',
  ],
  [2, 'Pacol Poultry House', 'CHECKUP', 'NO_SIGNS', null, 'Flock checked; multivitamins given.'],
  [
    12,
    'Carolina Cattle Range',
    'MONITORING',
    'SICK_ANIMALS',
    2,
    '3 cattle still with foot lesions; treated.',
  ],
  [
    14,
    'Pacol Carabao Yard',
    'ROUTINE',
    'NO_SIGNS',
    null,
    'Masterlist update: 3 carabao counted. Exact location still to be pinned.',
  ],
  [
    35,
    'Isarog Foothill Farm',
    'CHECKUP',
    'NO_SIGNS',
    null,
    'Pigs checked after the Hemorrhagic Septicemia case.',
  ],
  [40, 'Carolina Cattle Range', 'DEWORMING', 'NO_SIGNS', null, 'Previous deworming round.'],
];

/** Share of a group's heads per classification (same order as CLASSIFICATIONS), for the demo breakdowns. */
const SHARES: Partial<Record<Species, number[]>> = {
  Swine: [0.35, 0.15, 0.3, 0.05, 0.12],
  Cattle: [0.2, 0.2, 0.1, 0.4],
  Carabao: [0.15, 0.15, 0.15, 0.4],
  Goat: [0.3, 0.15, 0.1, 0.4],
  Chicken: [0.15, 0.15, 0.2, 0.42],
};

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

async function main() {
  console.log('Seeding Naga City livestock demo data…');
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
  const userId = (who: Who) => (who === 'MARK' ? users[1].id : who === 'JOY' ? users[2].id : null);
  const nameOf = (who: Who) => (who === 'JOY' ? JOY : MARK);

  // `--empty`: start fresh — keep only the login accounts, no demo records.
  if (process.argv.includes('--empty')) {
    console.log(
      'Empty database ready: 4 login accounts, no owners/farms/cases. Sign in with admin@nagacityvet.gov.ph / Livestock@2026',
    );
    return;
  }

  /* owners (+ one archived) */
  const owners: Awaited<ReturnType<typeof prisma.owner.create>>[] = [];
  for (let i = 0; i < OWNERS.length; i++) {
    const [fullName, barangay, zone, rsbsa, remarks] = OWNERS[i];
    owners.push(
      await prisma.owner.create({
        data: {
          code: code('OWN', i + 1),
          fullName,
          barangay,
          zone,
          rsbsa,
          remarks,
          street: `${10 * (i + 1)} Rizal St.`,
          // The masterlist comes from the DA list and from farm visits (raisers do not self-register).
          source: i < 4 ? 'DA_LIST' : 'FARM_VISIT',
          contact: `0917-555-${String(1000 + i * 37).padStart(4, '0')}`,
          registeredAt: DT('2026-05-04T09:00:00'),
        },
      }),
    );
  }
  const archivedOwner = await prisma.owner.create({
    data: {
      code: code('OWN', OWNERS.length + 1),
      fullName: 'Danilo Prieto',
      barangay: 'Abella',
      zone: 'Zone 2',
      street: '15 Panganiban Drive',
      contact: '0917-555-1780',
      status: 'ARCHIVED',
      source: 'DA_LIST',
      remarks: 'Stopped raising pigs and moved to Pili, Camarines Sur. Archived, not deleted.',
      registeredAt: DT('2026-05-04T09:00:00'),
    },
  });

  /* farms, population groups and their monthly head counts */
  const now = isoMonth();
  const farms: Awaited<ReturnType<typeof prisma.farm.create>>[] = [];
  const groups = new Map<string, { id: number; species: string }>(); // key: farm|species
  let groupNo = 0;
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
        lat: f.lat,
        lng: f.lng,
        pastureArea: f.pasture?.[0] ?? null,
        pastureLocation: f.pasture?.[1] ?? null,
        pastureLat: f.pasture?.[2] ?? null,
        pastureLng: f.pasture?.[3] ?? null,
        remarks: f.remarks ?? null,
        source: f.owner <= 4 ? 'DA_LIST' : 'FARM_VISIT',
        createdAt: DT('2026-05-05T08:00:00'),
      },
    });
    farms.push(farm);
    const last =
      f.status === 'verified' ? now : f.status === 'overdue' ? addMonths(now, -1) : addMonths(now, -2);
    for (const [species, count, breed] of f.groups) {
      groupNo += 1;
      const g = await prisma.populationGroup.create({
        data: {
          code: code('GRP', groupNo),
          farmId: farm.id,
          species,
          breed,
          count,
          lastVerified: last,
          createdAt: DT('2026-05-05T08:00:00'),
        },
      });
      groups.set(`${f.name}|${species}`, { id: g.id, species });
      // One count per month from May 2026 to the last verified month, growing a little to today's count.
      const months: string[] = [];
      for (let m = '2026-05'; m <= last; m = addMonths(m, 1)) months.push(m);
      let prev: number | null = null;
      for (let k = 0; k < months.length; k++) {
        const value =
          k === months.length - 1 ? count : Math.round(count * (1 - 0.02 * (months.length - 1 - k)));
        const change = value - (prev ?? 0);
        await prisma.populationUpdate.create({
          data: {
            groupId: g.id,
            month: months[k],
            count: value,
            previous: prev,
            change,
            reason:
              k === 0
                ? 'Initial count'
                : change > 0
                  ? `births +${change}`
                  : change === 0
                    ? 'No change'
                    : `deaths ${change}`,
            createdBy: k % 2 ? JOY : MARK,
            createdAt: DT(`${months[k]}-05T10:00:00`),
          },
        });
        prev = value;
      }
    }
  }
  const farmByName = (n: string) => farms.find((f) => f.name === n)!;
  const groupOf = (farm: string, species: string) => groups.get(`${farm}|${species}`)!;

  // A corrected month ("Adjusted" in the history): GRP-0001 last month re-counted.
  const lastMonth = await prisma.populationUpdate.findFirst({
    where: { groupId: 1, month: addMonths(now, -1) },
  });
  if (lastMonth) {
    await prisma.populationUpdate.update({ where: { id: lastMonth.id }, data: { superseded: true } });
    const { id: _id, createdAt: _c, superseded: _s, ...rest } = lastMonth;
    await prisma.populationUpdate.create({
      data: { ...rest, reason: 'Recount after site visit', createdBy: MARK },
    });
  }

  // Herd health shown on the groups.
  for (const [farm, species, healthStatus, remarks] of [
    ['Carolina Cattle Range', 'Cattle', 'Quarantined', 'FMD suspected (CASE-0002)'],
    ['Del Rosario Poultry', 'Chicken', 'Sick', 'Newcastle disease suspected (CASE-0003)'],
  ])
    await prisma.populationGroup.update({
      where: { id: groupOf(farm, species).id },
      data: { healthStatus, remarks },
    });
  await prisma.populationGroup.update({
    where: { id: groupOf('Hillside Ranch', 'Goat').id },
    data: { sex: 'Female', lifeStage: 'breeder', remarks: 'Breeding herd of does' },
  });

  // The archived owner's closed farm, with its emptied group — archived, kept for the records.
  const closedFarm = await prisma.farm.create({
    data: {
      code: code('FRM', FARMS.length + 1),
      name: 'Prieto Piggery (closed)',
      ownerId: archivedOwner.id,
      type: 'backyard',
      barangay: 'Abella',
      zone: 'Zone 2',
      address: 'Zone 2, Brgy. Abella, Naga City',
      lat: 13.6268,
      lng: 123.1875,
      remarks: 'Stopped operating in June 2026; pens taken down.',
      archived: true,
      createdAt: DT('2026-05-05T08:00:00'),
    },
  });
  const closedGroup = await prisma.populationGroup.create({
    data: {
      code: code('GRP', ++groupNo),
      farmId: closedFarm.id,
      species: 'Swine',
      breed: 'Large White',
      count: 0,
      lastVerified: '2026-06',
      remarks: 'All pigs sold before the farm closed',
      archived: true,
      createdAt: DT('2026-05-05T08:00:00'),
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

  /* tagged animals */
  const animals: Awaited<ReturnType<typeof prisma.animal.create>>[] = [];
  for (let i = 0; i < ANIMALS.length; i++) {
    const a = ANIMALS[i];
    const animal = await prisma.animal.create({
      data: {
        code: `NC-${SPECIES_ID_LETTER[a.species]}-${String(i + 1).padStart(4, '0')}`,
        earTag: `ET-${2401 + i}`,
        groupId: groupOf(a.farm, a.species).id,
        species: a.species,
        breed: a.breed,
        sex: a.sex,
        dob: a.dob ? D(a.dob) : null,
        estimatedAge: a.age ?? null,
        lifeStage: a.species === 'Goat' ? 'breeder' : 'adult',
        markings: a.markings,
        cowlick: a.cowlick ?? null,
        health: a.status === 'DECEASED' ? 'deceased' : 'healthy',
        status: a.status ?? 'ACTIVE',
        remarks: a.remarks ?? null,
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
    if (a.status)
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
  }

  /* ownership transfers: a sale, and a transfer recorded in error then reversed */
  const hill = farmByName('Hillside Ranch');
  const ccr = farmByName('Carolina Cattle Range');
  const transfers: [number, number, number, number, 'TRANSFER' | 'REVERSAL', string][] = [
    // animal, days ago, from farm, to farm, type, remarks
    [1, 90, hill.id, ccr.id, 'TRANSFER', 'Sold to Ramon Mendoza'],
    [2, 70, hill.id, ccr.id, 'TRANSFER', 'Sale between registered owners'],
    [2, 69, ccr.id, hill.id, 'REVERSAL', 'Reversal — recorded on the wrong animal'],
  ];
  for (let i = 0; i < transfers.length; i++) {
    const [animalId, days, fromFarmId, toFarmId, type, remarks] = transfers[i];
    const from = farms.find((f) => f.id === fromFarmId)!;
    const to = farms.find((f) => f.id === toFarmId)!;
    const t = await prisma.ownershipTransfer.create({
      data: {
        code: code('TRF', i + 1),
        animalId,
        date: D(ago(days)),
        fromOwnerId: from.ownerId,
        fromFarmId,
        toOwnerId: to.ownerId,
        toFarmId,
        type,
        remarks,
        createdBy: MARK,
      },
    });
    const name = (id: number) => owners.find((o) => o.id === id)!.fullName;
    await prisma.activityLog.create({
      data: {
        entity: 'animal',
        entityId: animalId,
        action: type === 'REVERSAL' ? 'reversal' : 'transfer',
        summary: `${type === 'REVERSAL' ? 'Reversal' : 'Transfer'} ${t.code}: ${name(from.ownerId)} → ${name(to.ownerId)}`,
        byName: MARK,
        createdAt: DT(`${ago(days)}T10:00:00`),
      },
    });
  }

  /* stray incidents: one at each status, plus one voided */
  const strays = [
    {
      // Tagged animal: the ear tag links the report to the animal and its owner. Fine not yet paid.
      at: `${ago(20)}T09:36:00`,
      species: 'Carabao',
      earTag: 'ET-2402',
      animalId: 2,
      ownerId: 1,
      barangay: 'Carolina',
      location: 'Carolina–Panicuason road, near the chapel',
      description: 'Carabao wandering on the road, rope broken. Reported by a tricycle driver.',
      lat: 13.6655,
      lng: 123.2731,
      status: 'REPORTED' as const,
      violations: 1,
      violationType: 'Animal on a public road or highway',
      fineAmount: 500,
      remarks: 'Owner informed by phone; to pay the fine.',
    },
    {
      // Closed after the fine was paid.
      at: `${ago(30)}T07:10:00`,
      species: 'Swine',
      ownerId: 7,
      barangay: 'Cararayan',
      location: 'Cararayan public market',
      description: 'Sow roaming at the market entrance. Second time this year.',
      lat: 13.6372,
      lng: 123.2359,
      status: 'CLOSED' as const,
      violations: 2,
      violationType: 'Repeat offense',
      fineAmount: 1500,
      finePaid: true,
      orNumber: 'OR-7712398',
      paidAt: D(ago(29)),
    },
    {
      // Settled with a warning.
      at: `${ago(45)}T15:20:00`,
      species: 'Goat',
      ownerId: 5,
      barangay: 'Pacol',
      location: 'Pacol elementary school grounds',
      description: 'Two goats grazing inside the school grounds.',
      status: 'CLOSED' as const,
      violations: 1,
      violationType: 'Stray / roaming animal',
      remarks: 'Owner warned in writing and fixed the fence. No fine (first offense).',
    },
    {
      // New report, owner not known yet (no ear tag).
      at: `${ago(3)}T07:15:00`,
      species: 'Cattle',
      barangay: 'Concepcion Grande',
      location: 'Concepcion Grande–Del Rosario road, near the bridge',
      description: 'Brown heifer without an ear tag, tied to a post by residents. Owner unknown.',
      lat: 13.6171,
      lng: 123.2109,
      status: 'REPORTED' as const,
      violationType: 'Unregistered or untagged animal',
    },
    {
      // The same heifer reported again: voided, not deleted.
      at: `${ago(3)}T08:40:00`,
      species: 'Cattle',
      barangay: 'Concepcion Grande',
      location: 'Near the Concepcion Grande bridge',
      description: 'Stray cow on the road.',
      status: 'REPORTED' as const,
      voidedAt: DT(`${ago(2)}T10:00:00`),
      voidedBy: LIZA,
      voidReason: 'Same heifer as STR-0004, reported twice',
    },
  ];
  for (let i = 0; i < strays.length; i++) {
    const { at, ...s } = strays[i];
    await prisma.strayIncident.create({
      data: {
        code: code('STR', i + 1),
        discoveredAt: DT(at),
        createdBy: i % 2 ? JOY : MARK,
        createdAt: DT(at),
        ...s,
      },
    });
  }

  /* disease cases with their history, site visits, lab records and response measures */
  const STEPS = ['SUSPECTED', 'SAMPLE_COLLECTED', 'SENT_TO_LAB'] as const;
  const STEP_DAY: Record<string, number> = {
    SUSPECTED: 0,
    SAMPLE_COLLECTED: 1,
    SENT_TO_LAB: 2,
    POSITIVE: 8,
    NEGATIVE: 7,
  };
  const STEP_NOTE: Record<string, string> = {
    SUSPECTED: 'Case reported',
    SAMPLE_COLLECTED: 'Samples collected during the site visit',
    SENT_TO_LAB: 'Samples sent to RADDL',
    POSITIVE: 'Laboratory confirmed: positive',
    NEGATIVE: 'Laboratory result: negative',
  };
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const reported = ago(c.reported);
    const day = (x: Day) => (typeof x === 'number' ? ago(c.reported - x) : x);
    const farm = farmByName(c.farm);
    const inspector = nameOf(c.by);
    const closedAt = c.closed
      ? DT(`${day(c.closed.on)}T15:00:00`)
      : c.voided
        ? DT(`${day(c.voided.on)}T09:00:00`)
        : null;
    const created = await prisma.diseaseCase.create({
      data: {
        code: code('CASE', i + 1),
        ownerId: farm.ownerId,
        farmId: farm.id,
        barangay: farm.barangay,
        zone: farm.zone,
        species: c.species,
        disease: c.disease,
        affected: c.affected,
        deaths: c.deaths,
        populationReconciled: c.reconciled ?? c.deaths,
        symptomsDate: D(ago(c.reported + 2)),
        reportedAt: D(reported),
        symptoms: c.symptoms,
        reportedBy: c.reportedBy ?? 'Barangay Agricultural Technician',
        assignedToId: userId(c.by),
        sampleInfo: c.labs ? `${c.labs[0].type} (${c.labs[0].count})` : null,
        lat: c.noLocation ? null : farm.lat,
        lng: c.noLocation ? null : farm.lng,
        locationSource: c.noLocation ? null : 'Farm Coordinates',
        status: c.status,
        relatedCaseId: c.related ?? null,
        closedAt,
        closedBy: closedAt ? LIZA : null,
        closureNote: c.closed?.note ?? (c.voided ? `Voided: ${c.voided.reason}` : null),
        closureOutcome: c.closed?.outcome ?? (c.voided ? 'OTHER' : null),
        voidedAt: c.voided ? closedAt : null,
        voidedBy: c.voided ? LIZA : null,
        voidReason: c.voided?.reason ?? null,
        createdAt: DT(`${reported}T08:30:00`),
      },
    });

    // Status history up to the current status, then closing or voiding.
    const path: string[] =
      c.status === 'POSITIVE' || c.status === 'NEGATIVE'
        ? [...STEPS, c.status]
        : STEPS.slice(0, STEPS.indexOf(c.status) + 1);
    for (const s of path)
      await prisma.caseStatusHistory.create({
        data: {
          caseId: created.id,
          status: s as any,
          note: STEP_NOTE[s],
          byName: s === 'POSITIVE' || s === 'NEGATIVE' ? LIZA : inspector,
          at: DT(`${day(STEP_DAY[s])}T${s === 'SUSPECTED' ? '08:30' : '16:00'}:00`),
        },
      });
    const endNote = c.closed
      ? `Case closed — ${c.closed.label}. ${c.closed.note}`
      : c.voided
        ? `Case voided: ${c.voided.reason}`
        : null;
    if (endNote)
      await prisma.caseStatusHistory.create({
        data: { caseId: created.id, status: c.status, note: endNote, byName: LIZA, at: closedAt! },
      });

    // Recent activity on the dashboard.
    const logs: [string, string, string, Date][] = [
      [
        'reported',
        `Disease case ${created.code} reported (${c.disease})`,
        inspector,
        DT(`${reported}T08:30:00`),
      ],
    ];
    if (c.status === 'POSITIVE')
      logs.push([
        'status',
        `${created.code} confirmed POSITIVE — ${c.disease}`,
        LIZA,
        DT(`${day(STEP_DAY.POSITIVE)}T16:00:00`),
      ]);
    if (endNote)
      logs.push([
        c.closed ? 'closed' : 'voided',
        `${created.code}: ${endNote}`.slice(0, 300),
        LIZA,
        closedAt!,
      ]);
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
    for (const m of c.measures ?? [])
      await prisma.responseActivity.create({
        data: {
          caseId: created.id,
          type: m.type,
          status: m.status ?? 'COMPLETED',
          date: D(day(m.on)),
          endDate: m.end != null ? D(day(m.end)) : null,
          location: m.location ?? null,
          personnel: m.personnel ?? inspector,
          remarks: m.remarks ?? null,
          heads: m.heads ?? null,
          disposalMethod: m.disposal ?? null,
        },
      });
  }

  /* vaccinations */
  for (let i = 0; i < VAX.length; i++) {
    const [days, vaccine, farmName, t, ref, count, dose, next, remarks, voidReason] = VAX[i];
    const group = t === 'G' ? groupOf(farmName, ref) : null;
    const animal = t === 'A' ? animals.find((a) => a.code === ref)! : null;
    await prisma.vaccination.create({
      data: {
        code: code('SRV', i + 1),
        serviceType: 'VACCINATION',
        farmId: farmByName(farmName).id,
        target: t === 'G' ? 'GROUP' : 'ANIMAL',
        groupId: group?.id ?? null,
        animalId: animal?.id ?? null,
        species: group?.species ?? animal!.species,
        count,
        vaccine,
        date: D(ago(days)),
        nextDate: next ? D(next) : null,
        doseNumber: dose,
        batch: `LOT-${String(i + 11).padStart(3, '0')}`,
        administeredBy: i % 2 ? JOY : MARK,
        remarks: remarks ?? null,
        voidedAt: voidReason ? DT(`${ago(days - 1)}T09:00:00`) : null,
        voidedBy: voidReason ? LIZA : null,
        voidReason: voidReason ?? null,
      },
    });
    if (animal)
      await prisma.activityLog.create({
        data: {
          entity: 'animal',
          entityId: animal.id,
          action: 'vaccination',
          summary: `Vaccinated: ${vaccine} (dose ${dose})`,
          byName: MARK,
          createdAt: DT(`${ago(days)}T10:00:00`),
        },
      });
  }

  // SRV-0001's reminder is done: its dose 2 was given (SRV-0002).
  await prisma.vaccination.update({ where: { id: 1 }, data: { reminderDone: true } });

  /* deworming and check-ups (goats and cattle first), given on farm visits */
  const firstService = VAX.length + 1;
  for (let i = 0; i < SERVICES.length; i++) {
    const [days, type, farmName, species, count, product, next, remarks] = SERVICES[i];
    const group = groupOf(farmName, species);
    await prisma.vaccination.create({
      data: {
        code: code('SRV', firstService + i),
        serviceType: type,
        farmId: farmByName(farmName).id,
        target: 'GROUP',
        groupId: group.id,
        species,
        count,
        vaccine: product,
        date: D(ago(days)),
        nextDate: next ? D(next) : null,
        doseNumber: 1,
        administeredBy: i % 2 ? JOY : MARK,
        remarks: remarks ?? 'Given during farm visit',
      },
    });
  }

  /* farm visits: masterlist updates, deworming rounds, check-ups and monitoring around disease reports */
  for (let i = 0; i < VISITS.length; i++) {
    const [days, farmName, purpose, findings, caseNo, remarks] = VISITS[i];
    const farm = farmByName(farmName);
    const v = await prisma.farmVisit.create({
      data: {
        code: code('VIS', i + 1),
        farmId: farm.id,
        caseId: caseNo ?? null,
        date: D(ago(days)),
        purpose,
        findings,
        visitedBy: i % 2 ? JOY : MARK,
        remarks,
        createdBy: i % 2 ? JOY : MARK,
        createdAt: DT(`${ago(days)}T15:00:00`),
      },
    });
    await prisma.activityLog.create({
      data: {
        entity: 'farm',
        entityId: farm.id,
        action: 'visit',
        summary: `Farm visit ${v.code}: ${purpose.toLowerCase()}`,
        byName: v.visitedBy,
        createdAt: v.createdAt,
      },
    });
  }

  /* head counts classified by age, sex and production stage (adds up to each group's count) */
  for (const g of await prisma.populationGroup.findMany({ where: { archived: false, count: { gt: 0 } } })) {
    const shares = SHARES[g.species as Species];
    if (!shares) continue;
    const list = CLASSIFICATIONS[g.species as Species];
    const b: Record<string, number> = {};
    let left = g.count;
    list.forEach((c, k) => {
      const n = k === list.length - 1 ? left : Math.min(left, Math.round(g.count * (shares[k] ?? 0)));
      if (n > 0) b[c.code] = n;
      left -= n;
    });
    // One group is left unclassified on purpose (shows "Not classified yet").
    if (g.code === 'GRP-0013') continue;
    await prisma.populationGroup.update({ where: { id: g.id }, data: { breakdown: b } });
  }

  /* PCIC insurance: claimed, active with insured ear tags, ending soon, expired */
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
        remarks: 'ASF claim for 10 pigs (CASE-0001), paid.',
      },
      {
        ownerId: 3,
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
        policyNo: 'PCIC-LV-2025-01042',
        species: 'Cattle',
        heads: 9,
        amountCovered: 360000,
        startDate: D(ago(345)),
        endDate: D(ahead(20)),
        status: 'ACTIVE',
        remarks: 'Ends soon; owner reminded to renew',
      },
      {
        ownerId: 2,
        policyNo: 'PCIC-LV-2025-00977',
        species: 'Swine',
        heads: 20,
        amountCovered: 180000,
        startDate: D('2025-07-01'),
        endDate: D('2026-06-30'),
        status: 'EXPIRED',
        remarks: 'Not renewed',
      },
    ],
  });
  // Ramon Mendoza's two tagged cattle are named on his cattle policy.
  await prisma.pcicPolicy.update({
    where: { id: 2 },
    data: { animals: { connect: [{ id: 1 }, { id: 3 }] } },
  });

  /* this year's vaccination targets (Reports & Analytics) */
  await prisma.setting.create({
    data: {
      key: `vaccinationTargets:${new Date().getFullYear()}`,
      value: JSON.stringify([
        { vaccine: HC, species: 'Swine', target: 100 },
        { vaccine: NCD, species: 'Chicken', target: 350 },
        { vaccine: HS, species: 'Cattle', target: 30 },
      ]),
    },
  });

  console.log(
    `Done: ${owners.length + 1} owners, ${farms.length + 1} farms, ${groupNo} groups, ${animals.length} animals, ${CASES.length} cases, ${VAX.length + SERVICES.length} service records, ${VISITS.length} farm visits, ${strays.length} stray reports.`,
  );
  console.log('Sign in with admin@nagacityvet.gov.ph / Livestock@2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
