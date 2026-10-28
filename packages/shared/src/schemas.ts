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
  CASE_OUTCOMES,
  INVESTIGATION_VISIT_TYPES,
  RESPONSE_STATUSES,
  VACCINATION_TARGETS,
} from './constants';
import { isoDate, isoMonth } from './format';

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
export const intField = (min = 0, msg?: string, max = 1_000_000) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ required_error: msg ?? 'Required', invalid_type_error: 'Must be a number' })
      .int('Must be a whole number')
      .min(min, `Must be at least ${min}`)
      .max(max, `Must be ${max.toLocaleString()} or less`),
  );

export const optInt = (min = 0, max = 1_000_000) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ invalid_type_error: 'Must be a number' })
      .int('Must be a whole number')
      .min(min, `Must be at least ${min}`)
      .max(max, `Must be ${max.toLocaleString()} or less`)
      .optional(),
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

/** Earliest date accepted anywhere (catches typos such as 0202-05-01). */
export const MIN_DATE = '2000-01-01';
/** Earliest date of birth accepted for an animal. */
export const MIN_DOB = '1990-01-01';

const validDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const notFuture = (s: string) => s <= isoDate();

/** Optional date that must be a real calendar day, not before `min` and not after today. */
export const pastDate = (min = MIN_DATE) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(DATE_RE, 'Use YYYY-MM-DD')
      .refine(validDay, 'Enter a valid date')
      .refine((s) => s >= min, `Date cannot be before ${min.slice(0, 4)}`)
      .refine(notFuture, 'Date cannot be in the future')
      .optional(),
  );
/** Required date, real calendar day, not before `min` and not after today. */
export const reqPastDate = (min = MIN_DATE) =>
  z
    .string({ required_error: 'Required' })
    .regex(DATE_RE, 'Use YYYY-MM-DD')
    .refine(validDay, 'Enter a valid date')
    .refine((s) => s >= min, `Date cannot be before ${min.slice(0, 4)}`)
    .refine(notFuture, 'Date cannot be in the future');
/** Optional date that may be in the future (schedules, end dates). */
export const anyDate = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(DATE_RE, 'Use YYYY-MM-DD')
    .refine(validDay, 'Enter a valid date')
    .refine((s) => s >= MIN_DATE, `Date cannot be before ${MIN_DATE.slice(0, 4)}`)
    .optional(),
);
/** Required date that may be in the future. */
export const reqAnyDate = z
  .string({ required_error: 'Required' })
  .regex(DATE_RE, 'Use YYYY-MM-DD')
  .refine(validDay, 'Enter a valid date')
  .refine((s) => s >= MIN_DATE, `Date cannot be before ${MIN_DATE.slice(0, 4)}`);

/** Philippine mobile or landline: digits with optional spaces, dashes, brackets or +63. */
export const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const phoneField = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : blankToUndefined(v)),
  z
    .string()
    .max(40)
    .refine(
      (s) => PHONE_RE.test(s) && s.replace(/\D/g, '').length >= 7 && s.replace(/\D/g, '').length <= 13,
      'Enter a valid contact number (e.g. 0917-123-4567)',
    )
    .optional(),
);
/** Largest head count accepted in one field (guards against typing errors). */
export const MAX_HEAD = 100000;
export const optDateTime = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/, 'Invalid date/time')
    .optional(),
);
export const monthField = z
  .string({ required_error: 'Required' })
  .regex(MONTH_RE, 'Use YYYY-MM')
  .refine((m) => m >= MIN_DATE.slice(0, 7), `Month cannot be before ${MIN_DATE.slice(0, 4)}`)
  .refine((m) => m <= isoMonth(), 'Cannot use a future month');
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
  fullName: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v),
    z
      .string({ required_error: 'Required' })
      .min(1, 'Required')
      .min(2, 'Enter the full name')
      .max(150)
      .regex(/^[\p{L}][\p{L} .,'-]*$/u, 'Use letters, spaces, periods, commas, apostrophes or hyphens'),
  ),
  barangay: z.enum(BARANGAYS, { errorMap: () => ({ message: 'Select a barangay' }) }),
  zone: optText(60),
  street: optText(200),
  contact: phoneField,
  rsbsa: optText(60),
  remarks: optText(1000),
  /** Set after the user confirms a possible duplicate (same name in the same barangay) is a different person. */
  confirmDuplicate: z.boolean().optional(),
});
export type OwnerCreateInput = z.infer<typeof ownerCreateSchema>;
export const ownerUpdateSchema = ownerCreateSchema.extend({ status: z.enum(OWNER_STATUSES).optional() });

export const pcicCreateSchema = z
  .object({
    policyNo: reqText(60),
    species: z.enum(SPECIES),
    heads: intField(1, undefined, MAX_HEAD),
    amountCovered: nullableNumber(0, 100_000_000),
    startDate: reqAnyDate,
    endDate: reqAnyDate,
    status: z.enum(PCIC_STATUSES).default('ACTIVE'),
    remarks: optText(500),
    /** The insured tagged animals (optional; at most the number of insured heads). */
    animalIds: z
      .preprocess(
        (v) => (v == null || v === false ? [] : (Array.isArray(v) ? v : [v]).map(Number)),
        z.array(z.number().int().positive()).max(MAX_HEAD),
      )
      .optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Coverage end cannot be before the start',
  })
  .refine((v) => !v.animalIds || v.animalIds.length <= v.heads, {
    path: ['animalIds'],
    message: 'More animals are selected than the number of insured heads',
  });

/* ---------- farms ---------- */

export const farmCreateSchema = z.object({
  ownerId: idField('Select an owner'),
  name: reqText(150),
  type: z.enum(FARM_TYPES),
  barangay: z.enum(BARANGAYS, { errorMap: () => ({ message: 'Select a barangay' }) }),
  zone: optText(60),
  pastureArea: nullableNumber(0),
  /** Pasture / grazing area away from the farm: description and map pin. */
  pastureLocation: optText(250),
  pastureLat: nullableNumber(-90, 90),
  pastureLng: nullableNumber(-180, 180),
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
  count: intField(0, undefined, MAX_HEAD),
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
        count: intField(0, undefined, MAX_HEAD),
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
  dob: pastDate(MIN_DOB),
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

/** Move a tagged animal to another group on the same farm (e.g. young stock to the adult group). */
export const animalMoveSchema = z.object({
  groupId: idField('Select the new group'),
  reason: optText(200),
});

export const transferCreateSchema = z.object({
  animalId: idField(),
  toFarmId: idField('Select the receiving farm'),
  date: reqPastDate(),
  type: z.enum(TRANSFER_TYPES).default('TRANSFER'),
  remarks: optText(300),
});

/* ---------- stray & violations ---------- */

export const strayCreateSchema = z.object({
  earTag: optText(40),
  ownerId: optId,
  species: z.enum(SPECIES),
  discoveredAt: optDateTime
    .refine((s) => !s || new Date(s).getTime() <= Date.now() + 5 * 60_000, 'Cannot be in the future')
    .refine((s) => !s || s.slice(0, 10) >= MIN_DATE, `Date cannot be before ${MIN_DATE.slice(0, 4)}`),
  barangay: z.enum(BARANGAYS, { errorMap: () => ({ message: 'Select a barangay' }) }),
  location: reqText(200),
  description: optText(1000),
  lat: nullableNumber(-90, 90),
  lng: nullableNumber(-180, 180),
  photoKeys,
});
export const strayUpdateSchema = z.object({
  status: z.enum(STRAY_STATUSES).optional(),
  violations: optInt(0, 1000),
  violationType: optText(80),
  ownerId: optId,
  remarks: optText(1000),
  fineAmount: nullableNumber(0, 1_000_000),
  finePaid: z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).optional(),
  orNumber: optText(40),
  paidAt: pastDate(),
  impoundedAt: pastDate(),
  impoundPlace: optText(200),
  releasedAt: pastDate(),
  releasedTo: optText(150),
});

/** The stray incident as it will be saved (current record merged with the changes). */
export interface StrayState {
  status: string;
  /** Day the animal was found (local YYYY-MM-DD). */
  foundOn?: string | null;
  fineAmount?: number | null;
  finePaid?: boolean | null;
  orNumber?: string | null;
  paidAt?: string | null;
  impoundedAt?: string | null;
  impoundPlace?: string | null;
  releasedAt?: string | null;
  releasedTo?: string | null;
}

/**
 * Penalty and impoundment rules shared by the form and the API:
 * - an impounded animal needs the impound date and place; a released one needs the release date and
 *   who received it;
 * - release dates belong only to released or closed incidents, impound dates not to a fresh report;
 * - dates follow the order discovered → impounded → released;
 * - a paid fine needs the amount and the official receipt number.
 */
export function strayErrors(v: StrayState): Record<string, string> {
  const e: Record<string, string> = {};
  const found = v.foundOn ?? null;
  if (v.status === 'IMPOUNDED') {
    if (!v.impoundedAt) e.impoundedAt = 'Enter the date the animal was impounded';
    if (!v.impoundPlace) e.impoundPlace = 'Enter where the animal is impounded';
  }
  if (v.status === 'RELEASED') {
    if (!v.releasedAt) e.releasedAt = 'Enter the release date';
    if (!v.releasedTo) e.releasedTo = 'Enter who received the animal';
  }
  if (v.status === 'REPORTED' && v.impoundedAt)
    e.status = 'Set the status to Impounded (or later) when an impound date is entered';
  if ((v.status === 'REPORTED' || v.status === 'IMPOUNDED') && v.releasedAt)
    e.status = 'Set the status to Released when a release date is entered';
  if (found && v.impoundedAt && v.impoundedAt < found)
    e.impoundedAt = 'Cannot be before the animal was found';
  if (v.releasedAt && v.impoundedAt && v.releasedAt < v.impoundedAt)
    e.releasedAt = 'Cannot be before the impound date';
  else if (found && v.releasedAt && v.releasedAt < found)
    e.releasedAt = 'Cannot be before the animal was found';
  if (v.finePaid) {
    if (!v.fineAmount) e.fineAmount = 'Enter the fine amount';
    if (!v.orNumber) e.orNumber = 'Enter the official receipt (OR) number';
  }
  if (found && v.paidAt && v.paidAt < found) e.paidAt = 'Cannot be before the animal was found';
  if (v.paidAt && !v.finePaid) e.finePaid = 'Tick "Fine paid" when a payment date is entered';
  return e;
}

/** The incident form: field rules plus the penalty / impoundment rules, given when it was found. */
export const strayFormSchema = (foundOn?: string | null) =>
  strayUpdateSchema.superRefine((v, ctx) => {
    const errors = strayErrors({ ...v, status: v.status ?? 'REPORTED', foundOn });
    for (const [path, message] of Object.entries(errors))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  });

/* ---------- disease surveillance ---------- */

export const caseCreateSchema = z
  .object({
    ownerId: idField('Select an owner'),
    farmId: idField('Select a farm'),
    zone: optText(60),
    species: z.enum(SPECIES, { errorMap: () => ({ message: 'Select a species' }) }),
    disease: reqText(150),
    affected: intField(1, undefined, MAX_HEAD),
    deaths: intField(0, undefined, MAX_HEAD),
    symptomsDate: pastDate(),
    reportedAt: pastDate(),
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
  })
  .refine((v) => !v.symptomsDate || v.symptomsDate <= (v.reportedAt ?? isoDate()), {
    path: ['symptomsDate'],
    message: 'Symptoms cannot be observed after the report date',
  });
export type CaseCreateInput = z.infer<typeof caseCreateSchema>;

export const caseStatusSchema = z.object({ status: z.enum(CASE_STATUSES), note: optText(500) });
/** Details that can change while a case is open (species, farm and dates reported stay fixed). */
export const caseUpdateSchema = z
  .object({
    disease: reqText(150),
    zone: optText(60),
    affected: intField(1, undefined, MAX_HEAD),
    deaths: intField(0, undefined, MAX_HEAD),
    symptomsDate: pastDate(),
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
export const caseCloseSchema = z.object({
  outcome: z.enum(CASE_OUTCOMES, { errorMap: () => ({ message: 'Select the outcome' }) }),
  note: reqText(1000, 'Write the closing remarks / outcome'),
});
export const caseLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const investigationCreateSchema = z
  .object({
    date: pastDate(),
    visitType: z.enum(INVESTIGATION_VISIT_TYPES).default('INITIAL'),
    investigator: optText(120),
    animalsExamined: optInt(0, MAX_HEAD),
    sickCount: optInt(0, MAX_HEAD),
    deadCount: optInt(0, MAX_HEAD),
    clinicalSigns: optText(1000),
    biosecurity: optText(1000),
    actionsTaken: optText(1000),
    samplesCollected: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
    nextVisit: anyDate,
    notes: reqText(2000, 'Write the findings'),
  })
  .refine((v) => v.sickCount == null || v.animalsExamined == null || v.sickCount <= v.animalsExamined, {
    path: ['sickCount'],
    message: 'Sick animals cannot exceed animals examined',
  })
  .refine((v) => !v.nextVisit || v.nextVisit > (v.date ?? isoDate()), {
    path: ['nextVisit'],
    message: 'Next visit must be after the visit date',
  });
export const labCreateSchema = z
  .object({
    sampleId: reqText(60),
    sampleType: optText(80),
    sampleCount: optInt(1, 10000),
    testMethod: optText(80),
    collectedAt: pastDate(),
    laboratory: optText(120),
    labReference: optText(60),
    submittedBy: optText(120),
    sentAt: pastDate(),
    result: z.enum(LAB_RESULTS).default('PENDING'),
    resultDate: pastDate(),
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
    status: z.enum(RESPONSE_STATUSES).default('COMPLETED'),
    /** Start date; may be in the future only for a planned activity. */
    date: anyDate,
    /** When the measure ends or is lifted (quarantine, movement restriction, checkpoint). */
    endDate: anyDate,
    location: optText(200),
    personnel: optText(200),
    remarks: optText(1000),
    /** Number of animals culled (Culling / depopulation only). */
    heads: optInt(1, MAX_HEAD),
    disposalMethod: optText(80),
  })
  .refine((v) => v.status === 'PLANNED' || !v.date || v.date <= isoDate(), {
    path: ['date'],
    message: 'A future date is only allowed for a planned activity',
  })
  .refine((v) => !v.endDate || !v.date || v.endDate >= v.date, {
    path: ['endDate'],
    message: 'End date cannot be before the start date',
  })
  .refine((v) => v.type !== 'CULLING_DEPOPULATION' || v.status === 'PLANNED' || !!v.heads, {
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
    count: intField(1, undefined, MAX_HEAD),
    vaccine: reqText(120),
    date: pastDate(),
    nextDate: anyDate,
    doseNumber: intField(1, undefined, 20),
    batch: optText(60),
    administeredBy: optText(120),
    remarks: optText(500),
  })
  .refine((v) => (v.target === 'GROUP' ? !!v.groupId : !!v.animalId), {
    path: ['groupId'],
    message: 'Select a target',
  })
  .refine((v) => !v.nextDate || v.nextDate > (v.date ?? isoDate()), {
    path: ['nextDate'],
    message: 'Next schedule must be after the vaccination date',
  })
  .refine(
    (v) => {
      if (!v.nextDate) return true;
      const limit = new Date(`${v.date ?? isoDate()}T00:00:00Z`);
      limit.setUTCFullYear(limit.getUTCFullYear() + 3);
      return v.nextDate <= limit.toISOString().slice(0, 10);
    },
    { path: ['nextDate'], message: 'Next schedule should be within 3 years' },
  );
export type VaccinationCreateInput = z.infer<typeof vaccinationCreateSchema>;

/* ---------- settings ---------- */

export const settingsSchema = z.object({
  officeName: reqText(150),
  cityName: reqText(80),
  defaultRadiusMeters: intField(50, undefined, 50000),
  populationOverdueDays: intField(1, undefined, 365),
  vaccinationUpcomingDays: intField(1, undefined, 365),
  letterheadLine1: optText(150),
  letterheadLine2: optText(150),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/* ---------- reports ---------- */

export const reportQuerySchema = z
  .object({
    barangay: optText(80),
    species: optText(40),
    from: anyDate,
    to: anyDate,
  })
  .refine((v) => !v.from || !v.to || v.to >= v.from, { path: ['to'], message: '"To" is before "From"' });