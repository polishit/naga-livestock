import { z } from 'zod';
import {
  ANIMAL_STATUSES,
  BARANGAYS,
  CASE_STATUSES,
  FARM_TYPES,
  LAB_RESULTS,
  MAX_PHOTOS,
  OWNER_STATUSES,
  PCIC_STATUSES,
  RESPONSE_TYPES,
  ROLES,
  SPECIES,
  STRAY_STATUSES,
  TRANSFER_TYPES,
  VACCINATION_TARGETS,
} from './constants';

/* ---------- helpers: form inputs arrive as strings, JSON may contain null ---------- */

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/** Optional trimmed text; blank becomes undefined. */
export const optText = (max = 500) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : blankToUndefined(v)),
    z.string().max(max).optional(),
  );

/** Required trimmed text. */
export const reqText = (max = 200, msg = 'Required') =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string({ required_error: msg }).min(1, msg).max(max),
  );

/** Integer coerced from string. */
export const intField = (min = 0, msg?: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ required_error: msg ?? 'Required', invalid_type_error: 'Must be a number' })
      .int('Must be a whole number')
      .min(min, `Must be at least ${min}`),
  );

export const optInt = (min = 0) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Must be a number' }).int().min(min).optional(),
  );

/** Optional number that may be explicitly cleared with null. */
export const nullableNumber = (min?: number, max?: number) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v === null ? null : Number(v)),
    (() => {
      let n = z.number({ invalid_type_error: 'Must be a number' });
      if (min !== undefined) n = n.min(min);
      if (max !== undefined) n = n.max(max);
      return n.nullable().optional();
    })(),
  );

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export const optDate = z.preprocess(blankToUndefined, z.string().regex(DATE_RE, 'Use YYYY-MM-DD').optional());
export const reqDate = z.string({ required_error: 'Required' }).regex(DATE_RE, 'Use YYYY-MM-DD');
export const optDateTime = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/, 'Invalid date/time')
    .optional(),
);
export const monthField = z.string({ required_error: 'Required' }).regex(MONTH_RE, 'Use YYYY-MM');
export const optMonth = z.preprocess(blankToUndefined, monthField.optional());

const idField = (msg = 'Required') => intField(1, msg);
const optId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined || v === '0' ? undefined : Number(v)),
  z.number().int().positive().optional(),
);

/** Storage keys of uploaded photos (up to MAX_PHOTOS). */
const photoKeys = z
  .array(z.string().min(1).max(300))
  .max(MAX_PHOTOS, `You can attach up to ${MAX_PHOTOS} photos`)
  .optional();

/* ---------- auth & users ---------- */

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userCreateSchema = z.object({
  name: reqText(120),
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(ROLES),
  title: optText(120),
  password: z.string().min(8, 'At least 8 characters'),
});
export const userUpdateSchema = z.object({
  name: reqText(120).optional(),
  role: z.enum(ROLES).optional(),
  title: optText(120),
  active: z.boolean().optional(),
  password: z.preprocess(blankToUndefined, z.string().min(8, 'At least 8 characters').optional()),
});

/* ---------- owners ---------- */

export const ownerCreateSchema = z.object({
  fullName: reqText(150),
  barangay: z.enum(BARANGAYS, { errorMap: () => ({ message: 'Select a barangay' }) }),
  zone: optText(60),
  street: optText(200),
  contact: optText(40),
  rsbsa: optText(60),
  remarks: optText(1000),
  /** Set after the user confirms a possible duplicate (same name in the same barangay) is a different person. */
  confirmDuplicate: z.boolean().optional(),
});
export type OwnerCreateInput = z.infer<typeof ownerCreateSchema>;
export const ownerUpdateSchema = ownerCreateSchema.extend({ status: z.enum(OWNER_STATUSES).optional() });

export const pcicCreateSchema = z.object({
  policyNo: reqText(60),
  species: z.enum(SPECIES),
  heads: intField(1),
  amountCovered: nullableNumber(0),
  startDate: reqDate,
  endDate: reqDate,
  status: z.enum(PCIC_STATUSES).default('ACTIVE'),
  remarks: optText(500),
});

/* ---------- farms ---------- */

export const farmCreateSchema = z.object({
  ownerId: idField('Select an owner'),
  name: reqText(150),
  type: z.enum(FARM_TYPES),
  barangay: z.enum(BARANGAYS, { errorMap: () => ({ message: 'Select a barangay' }) }),
  zone: optText(60),
  pastureArea: nullableNumber(0),
  address: optText(250),
  lat: nullableNumber(-90, 90),
  lng: nullableNumber(-180, 180),
  remarks: optText(1000),
});
export type FarmCreateInput = z.infer<typeof farmCreateSchema>;
export const farmUpdateSchema = farmCreateSchema.partial();
export const farmLocationSchema = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});
export const farmReassignSchema = z.object({ ownerId: idField('Select an owner') });

/* ---------- population ---------- */

export const groupCreateSchema = z.object({
  farmId: idField('Select a farm'),
  species: z.enum(SPECIES),
  breed: optText(80),
  sex: z.string().default('Mixed'),
  lifeStage: z.string().default('Mixed'),
  reportingMonth: optMonth,
  count: intField(0),
  healthStatus: z.string().default('Healthy'),
  remarks: optText(500),
});
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;
/** Species and counts are not edited here: counts change through monthly updates. */
export const groupUpdateSchema = z.object({
  breed: optText(80),
  sex: z.string().min(1).max(20),
  lifeStage: z.string().min(1).max(30),
  healthStatus: z.string().min(1).max(40),
  remarks: optText(500),
});

export const populationUpdateSchema = z.object({
  farmId: idField(),
  month: monthField,
  entries: z
    .array(
      z.object({
        groupId: idField(),
        count: intField(0),
        reason: optText(200),
      }),
    )
    .min(1, 'No groups to update'),
});
export type PopulationUpdateInput = z.infer<typeof populationUpdateSchema>;

/* ---------- animals & ownership ---------- */

export const animalCreateSchema = z.object({
  groupId: idField('Select a population group'),
  earTag: optText(40),
  breed: optText(80),
  sex: z.enum(['Female', 'Male']).default('Female'),
  dob: optDate,
  estimatedAge: optText(40),
  lifeStage: optText(40),
  markings: optText(200),
  cowlick: optText(200),
  health: optText(80),
  photoKeys,
  remarks: optText(500),
});
export type AnimalCreateInput = z.infer<typeof animalCreateSchema>;
export const animalUpdateSchema = animalCreateSchema
  .omit({ groupId: true })
  .partial()
  .extend({
    status: z.enum(ANIMAL_STATUSES).optional(),
  });

export const transferCreateSchema = z.object({
  animalId: idField(),
  toFarmId: idField('Select the receiving farm'),
  date: reqDate,
  type: z.enum(TRANSFER_TYPES).default('TRANSFER'),
  remarks: optText(300),
});

/* ---------- stray & violations ---------- */

export const strayCreateSchema = z.object({
  earTag: optText(40),
  ownerId: optId,
  species: z.enum(SPECIES),
  discoveredAt: optDateTime,
  barangay: z.enum(BARANGAYS, { errorMap: () => ({ message: 'Select a barangay' }) }),
  location: reqText(200),
  description: optText(1000),
  lat: nullableNumber(-90, 90),
  lng: nullableNumber(-180, 180),
  photoKeys,
});
export const strayUpdateSchema = z.object({
  status: z.enum(STRAY_STATUSES).optional(),
  violations: optInt(0),
  ownerId: optId,
  remarks: optText(1000),
});

/* ---------- disease surveillance ---------- */

export const caseCreateSchema = z
  .object({
    ownerId: idField('Select an owner'),
    farmId: idField('Select a farm'),
    zone: optText(60),
    species: z.enum(SPECIES, { errorMap: () => ({ message: 'Select a species' }) }),
    disease: reqText(150),
    affected: intField(1),
    deaths: intField(0),
    symptomsDate: optDate,
    reportedAt: optDate,
    symptoms: optText(1000),
    reportedBy: optText(120),
    assignedToId: optId,
    sampleInfo: optText(300),
    remarks: optText(1000),
    lat: nullableNumber(-90, 90),
    lng: nullableNumber(-180, 180),
    photoKeys,
    relatedCaseId: optId,
  })
  .refine((v) => v.deaths <= v.affected, {
    path: ['deaths'],
    message: 'Deaths cannot exceed animals affected',
  });
export type CaseCreateInput = z.infer<typeof caseCreateSchema>;

export const caseStatusSchema = z.object({ status: z.enum(CASE_STATUSES), note: optText(500) });
/** Details that can change while a case is open (species, farm and dates reported stay fixed). */
export const caseUpdateSchema = z
  .object({
    disease: reqText(150),
    zone: optText(60),
    affected: intField(1),
    deaths: intField(0),
    symptomsDate: optDate,
    symptoms: optText(1000),
    reportedBy: optText(120),
    assignedToId: optId,
    sampleInfo: optText(300),
    remarks: optText(1000),
  })
  .refine((v) => v.deaths <= v.affected, {
    path: ['deaths'],
    message: 'Deaths cannot exceed animals affected',
  });
export const caseCloseSchema = z.object({ note: reqText(1000, 'Write the closing remarks / outcome') });
export const caseLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const investigationCreateSchema = z.object({
  date: optDate,
  investigator: optText(120),
  notes: reqText(2000),
});
export const labCreateSchema = z
  .object({
    sampleId: reqText(60),
    sampleType: optText(80),
    collectedAt: optDate,
    laboratory: optText(120),
    sentAt: optDate,
    result: z.enum(LAB_RESULTS).default('PENDING'),
    resultDate: optDate,
    remarks: optText(500),
  })
  .refine((v) => !v.collectedAt || !v.sentAt || v.sentAt >= v.collectedAt, {
    path: ['sentAt'],
    message: 'Sent date cannot be before the collection date',
  })
  .refine((v) => !v.resultDate || !v.sentAt || v.resultDate >= v.sentAt, {
    path: ['resultDate'],
    message: 'Result date cannot be before the sent date',
  })
  .refine((v) => !v.resultDate || !v.collectedAt || v.resultDate >= v.collectedAt, {
    path: ['resultDate'],
    message: 'Result date cannot be before the collection date',
  })
  .refine((v) => v.result === 'PENDING' || !!v.resultDate, {
    path: ['resultDate'],
    message: 'Enter the date the result was released',
  });
export const responseCreateSchema = z
  .object({
    type: z.enum(RESPONSE_TYPES),
    date: optDate,
    personnel: optText(200),
    remarks: optText(1000),
    /** Number of animals culled (Culling / depopulation only). */
    heads: optInt(1),
  })
  .refine((v) => v.type !== 'CULLING_DEPOPULATION' || !!v.heads, {
    path: ['heads'],
    message: 'Enter how many animals were culled',
  });

/** Voiding keeps a wrong record (struck through) and excludes it from all figures. */
export const voidSchema = z.object({ reason: reqText(300, 'Write why this record is being voided') });

/* ---------- vaccination ---------- */

export const vaccinationCreateSchema = z
  .object({
    farmId: idField('Select a farm'),
    target: z.enum(VACCINATION_TARGETS).default('GROUP'),
    groupId: optId,
    animalId: optId,
    count: intField(1),
    vaccine: reqText(120),
    date: optDate,
    nextDate: optDate,
    doseNumber: intField(1),
    batch: optText(60),
    administeredBy: optText(120),
    remarks: optText(500),
  })
  .refine((v) => (v.target === 'GROUP' ? !!v.groupId : !!v.animalId), {
    path: ['groupId'],
    message: 'Select a target',
  });
export type VaccinationCreateInput = z.infer<typeof vaccinationCreateSchema>;

/* ---------- settings ---------- */

export const settingsSchema = z.object({
  officeName: reqText(150),
  cityName: reqText(80),
  defaultRadiusMeters: intField(50),
  populationOverdueDays: intField(1),
  vaccinationUpcomingDays: intField(1),
  letterheadLine1: optText(150),
  letterheadLine2: optText(150),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/* ---------- reports ---------- */

export const reportQuerySchema = z.object({
  barangay: optText(80),
  species: optText(40),
  from: optDate,
  to: optDate,
});