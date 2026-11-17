import { z } from 'zod';
import { BARANGAYS, BARANGAY_CENTERS, CLINICAL_SIGNS, FARM_TYPES, SERVICE_TYPES, SPECIES } from './constants';
import { intField, newPassword, optDate, optText, pastDate, reqDate, reqText } from './schemas';
import { distanceMeters } from './geo';

/**
 * The livestock owner side: registration, farm registration, head count updates, disease reports,
 * monitoring zones, vaccination activities, announcements and notifications. Shared by the owner
 * app, the CVO review pages and the server.
 */

/* ---------------- geography ---------------- */

const lats = Object.values(BARANGAY_CENTERS).map((c) => c![0]);
const lngs = Object.values(BARANGAY_CENTERS).map((c) => c![1]);
/** A box around Naga City (the barangay centres plus a margin of about 4 km). */
export const NAGA_BOUNDS = {
  minLat: Math.min(...lats) - 0.04,
  maxLat: Math.max(...lats) + 0.04,
  minLng: Math.min(...lngs) - 0.04,
  maxLng: Math.max(...lngs) + 0.04,
};
export const insideNaga = (lat: number, lng: number) =>
  lat >= NAGA_BOUNDS.minLat &&
  lat <= NAGA_BOUNDS.maxLat &&
  lng >= NAGA_BOUNDS.minLng &&
  lng <= NAGA_BOUNDS.maxLng;

/**
 * The barangay whose centre is nearest to a point (within `maxM` metres), for when the map service
 * does not know the barangay. A guess the owner or staff can still change.
 */
export function nearestBarangay(lat: number, lng: number, maxM = 4000): (typeof BARANGAYS)[number] | null {
  let best: (typeof BARANGAYS)[number] | null = null;
  let bestD = Infinity;
  for (const b of BARANGAYS) {
    const c = BARANGAY_CENTERS[b];
    if (!c) continue;
    const d = distanceMeters(lat, lng, c[0], c[1]);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return bestD <= maxM ? best : null;
}

/** A mobile number as 11 digits starting with 09 (accepts +63 and spaces); null when not valid. */
export function normalizePhone(v: string | null | undefined): string | null {
  if (!v) return null;
  let d = v.replace(/[^\d+]/g, '');
  if (d.startsWith('+63')) d = `0${d.slice(3)}`;
  else if (d.startsWith('63') && d.length === 12) d = `0${d.slice(2)}`;
  return /^09\d{9}$/.test(d) ? d : null;
}

/* ---------------- identity verification ---------------- */

/** Government-issued and local IDs the City Veterinary Office accepts to verify an owner. */
export const ID_TYPES = [
  'PHILSYS',
  'DRIVERS_LICENSE',
  'UMID',
  'PASSPORT',
  'POSTAL',
  'VOTERS',
  'PRC',
  'SENIOR',
  'PWD',
  'PHILHEALTH',
  'BARANGAY',
  'OTHER',
] as const;
export type IdType = (typeof ID_TYPES)[number];
export const ID_TYPE_LABELS: Record<IdType, string> = {
  PHILSYS: 'PhilSys National ID',
  DRIVERS_LICENSE: "Driver's License",
  UMID: 'UMID / SSS / GSIS ID',
  PASSPORT: 'Philippine Passport',
  POSTAL: 'Postal ID',
  VOTERS: "Voter's ID or Certification",
  PRC: 'PRC ID',
  SENIOR: 'Senior Citizen ID',
  PWD: 'PWD ID',
  PHILHEALTH: 'PhilHealth ID',
  BARANGAY: 'Barangay ID or Certificate',
  OTHER: 'Other Government ID',
};

/**
 * What a reviewer confirms before verifying. Every item must be ticked: a verification is a
 * statement by the office, not a single click.
 */
export const OWNER_CHECKS = ['ID_READABLE', 'ID_MATCHES', 'ADDRESS_OK', 'NO_DUPLICATE'] as const;
export const OWNER_CHECK_LABELS: Record<(typeof OWNER_CHECKS)[number], string> = {
  ID_READABLE: 'The ID photo is clear and readable, and the ID is not expired',
  ID_MATCHES: 'The name on the ID matches the name given',
  ADDRESS_OK: 'The address is inside Naga City and the barangay is correct',
  NO_DUPLICATE: 'This person is not already in the owner masterlist',
};
export const FARM_CHECKS = ['PIN_OK', 'LIVESTOCK_OK', 'NO_DUPLICATE'] as const;
export const FARM_CHECK_LABELS: Record<(typeof FARM_CHECKS)[number], string> = {
  PIN_OK: 'The map pin is at the farm and matches the barangay',
  LIVESTOCK_OK: 'The livestock and head counts are believable for this farm',
  NO_DUPLICATE: 'This farm is not already registered',
};
export const VACC_CHECKS = ['PROOF_OK', 'DETAILS_MATCH', 'HEADS_OK'] as const;
export const VACC_CHECK_LABELS: Record<(typeof VACC_CHECKS)[number], string> = {
  PROOF_OK: 'The proof (card, receipt or label) is readable',
  DETAILS_MATCH: 'The vaccine and date on the proof match the record',
  HEADS_OK: 'The number of head is not more than the recorded head count',
};
export const REPORT_CHECKS = ['PHOTOS_SEEN', 'FARM_CONFIRMED', 'NOT_DUPLICATE'] as const;
export const REPORT_CHECK_LABELS: Record<(typeof REPORT_CHECKS)[number], string> = {
  PHOTOS_SEEN: 'I read the description and looked at the photos',
  FARM_CONFIRMED: 'The farm and location are correct',
  NOT_DUPLICATE: 'This is a new incident, or I am attaching it to the open case',
};
const checklist = z.array(z.string().max(30)).max(10).default([]);
export const hasAll = (got: readonly string[] | undefined, need: readonly string[]) =>
  need.every((c) => (got ?? []).includes(c));

/* ---------------- statuses ---------------- */

export const REGISTRATION_STATUSES = ['PENDING', 'RETURNED', 'APPROVED', 'INACTIVE'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  PENDING: 'Pending Review',
  RETURNED: 'Returned for Correction',
  APPROVED: 'Verified',
  INACTIVE: 'Inactive',
};

/** Why a head count changed. `sign` is the direction the owner cannot get wrong. */
export const POP_REASONS = ['BIRTH', 'PURCHASE', 'SALE', 'DEATH', 'SLAUGHTER', 'LOST', 'CORRECTION'] as const;
export type PopReason = (typeof POP_REASONS)[number];
export const POP_REASON_LABELS: Record<PopReason, string> = {
  BIRTH: 'Birth',
  PURCHASE: 'Bought or received',
  SALE: 'Sold or given away',
  DEATH: 'Died',
  SLAUGHTER: 'Slaughtered',
  LOST: 'Lost or stolen',
  CORRECTION: 'Correct a wrong count',
};
export const POP_REASON_SIGN: Record<PopReason, 1 | -1 | 0> = {
  BIRTH: 1,
  PURCHASE: 1,
  SALE: -1,
  DEATH: -1,
  SLAUGHTER: -1,
  LOST: -1,
  CORRECTION: 0,
};
export const POP_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'CANCELLED'] as const;
export type PopRequestStatus = (typeof POP_REQUEST_STATUSES)[number];
export const POP_REQUEST_STATUS_LABELS: Record<PopRequestStatus, string> = {
  PENDING: 'Waiting for Review',
  ACCEPTED: 'Accepted',
  CANCELLED: 'Cancelled',
};

export const REPORT_STATUSES = ['REPORTED', 'INFO_REQUESTED', 'VALIDATED', 'REJECTED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * The stage of a disease report as the owner and the CVO see it. Reported and Rejected come from
 * the report; the rest follow the disease case opened for it.
 */
export const CASE_STAGES = [
  'REPORTED',
  'INFO_REQUESTED',
  'UNDER_INVESTIGATION',
  'CONFIRMED',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];
export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  REPORTED: 'Reported',
  INFO_REQUESTED: 'More Information Needed',
  UNDER_INVESTIGATION: 'Under Investigation',
  CONFIRMED: 'Confirmed',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};
export const CASE_STAGE_HELP: Record<CaseStage, string> = {
  REPORTED: 'The City Veterinary Office received the report and will review it.',
  INFO_REQUESTED: 'The office asked a question. Please reply so the review can continue.',
  UNDER_INVESTIGATION: 'The report was accepted. Staff are checking the farm and testing samples.',
  CONFIRMED: 'The laboratory confirmed the disease. Follow the instructions from the office.',
  RESOLVED: 'The response on the farm is finished. The office will close the case.',
  CLOSED: 'The case is finished.',
  REJECTED: 'The office did not accept the report. See the reason.',
};
/** Stage of a disease case (after the report was validated, or for a case staff entered). */
export function caseStage(c: {
  status: string;
  closedAt: Date | string | null;
  /** Nothing is left to do on the farm (no open measures, head count updated) */
  responseDone?: boolean;
}): CaseStage {
  if (c.closedAt) return 'CLOSED';
  if (c.status === 'POSITIVE') return c.responseDone ? 'RESOLVED' : 'CONFIRMED';
  return 'UNDER_INVESTIGATION';
}

export const ZONE_STATUSES = ['ACTIVE', 'LIFTED'] as const;
export type ZoneStatus = (typeof ZONE_STATUSES)[number];
export const ZONE_RADII = [500, 1000, 3000, 5000] as const;

export const ACTIVITY_STATUSES = ['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  SCHEDULED: 'Scheduled',
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
export const SIGNUP_STATUSES = ['SIGNED_UP', 'ATTENDED', 'NO_SHOW', 'CANCELLED'] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];
export const SIGNUP_STATUS_LABELS: Record<SignupStatus, string> = {
  SIGNED_UP: 'Signed Up',
  ATTENDED: 'Attended',
  NO_SHOW: 'Did Not Attend',
  CANCELLED: 'Cancelled',
};
export const OWNER_VACC_STATUSES = ['SUBMITTED', 'VERIFIED', 'REJECTED'] as const;
export type OwnerVaccStatus = (typeof OWNER_VACC_STATUSES)[number];
export const OWNER_VACC_STATUS_LABELS: Record<OwnerVaccStatus, string> = {
  SUBMITTED: 'Waiting for Verification',
  VERIFIED: 'Verified',
  REJECTED: 'Not Accepted',
};
export const SERVICE_REQUEST_STATUSES = ['REQUESTED', 'SCHEDULED', 'DONE', 'DECLINED'] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];
export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  REQUESTED: 'Requested',
  SCHEDULED: 'Scheduled',
  DONE: 'Done',
  DECLINED: 'Declined',
};
export const ANNOUNCEMENT_AUDIENCES = ['ALL', 'BARANGAY', 'ZONE'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  ALL: 'All livestock owners',
  BARANGAY: 'One barangay',
  ZONE: 'Farms inside a monitoring zone',
};

export const NOTIFICATION_TYPES = [
  'REGISTRATION',
  'POPULATION',
  'REPORT',
  'ALERT',
  'VACCINATION',
  'ANNOUNCEMENT',
  'SERVICE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  REGISTRATION: 'Registration',
  POPULATION: 'Head Count',
  REPORT: 'Disease Report',
  ALERT: 'Disease Alert',
  VACCINATION: 'Vaccination',
  ANNOUNCEMENT: 'Announcement',
  SERVICE: 'Service Request',
};
/** Types an owner may turn off. Disease alerts and updates on their own records always arrive. */
export const OPTIONAL_NOTIFICATION_TYPES = ['VACCINATION', 'ANNOUNCEMENT'] as const;

/* ---------------- schemas ---------------- */

const mobile = z
  .string({ required_error: 'Enter your mobile number' })
  .trim()
  .refine((v) => !!normalizePhone(v), 'Enter an 11-digit mobile number, for example 09171234567');
const barangay = z.enum(BARANGAYS, { errorMap: () => ({ message: 'Select a barangay' }) });
const species = z.enum(SPECIES, { errorMap: () => ({ message: 'Select the livestock' }) });
const coord = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(min).max(max),
  );
const photoKeys = z.array(z.string().max(200)).max(10, 'At most 10 photos').default([]);
const reason = reqText(300, 'Give the reason');

/** Sign in with an email or a mobile number. */
export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email or mobile number').max(120),
  password: z.string().min(1, 'Password is required'),
});

/** An owner creating their own account. */
export const ownerRegisterSchema = z
  .object({
    fullName: reqText(150, 'Enter your full name'),
    phone: mobile,
    email: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().email('Enter a valid email').max(120).optional(),
    ),
    barangay,
    zone: optText(60),
    street: optText(200),
    rsbsa: optText(60),
    idType: z.enum(ID_TYPES, { errorMap: () => ({ message: 'Select the type of ID' }) }),
    idNumber: reqText(60, 'Enter the ID number'),
    password: newPassword,
    confirm: z.string().min(1, 'Type the password again'),
    /** Data Privacy Act consent */
    consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to continue' }) }),
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'The two passwords do not match' });
export type OwnerRegisterInput = z.infer<typeof ownerRegisterSchema>;

export const ownerProfileSchema = z.object({
  fullName: reqText(150, 'Enter your full name'),
  barangay,
  zone: optText(60),
  street: optText(200),
  rsbsa: optText(60),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().email('Enter a valid email').max(120).optional(),
  ),
});

/** The owner sends (or sends again) their ID for verification. */
export const ownerVerificationSchema = z.object({
  idType: z.enum(ID_TYPES, { errorMap: () => ({ message: 'Select the type of ID' }) }),
  idNumber: reqText(60, 'Enter the ID number'),
  idPhotoKeys: z.array(z.string().max(200)).min(1, 'Add a photo of the front of your ID').max(2),
});

/** CVO staff giving an existing owner a login for the owner app. */
export const ownerAccountSchema = z.object({ phone: mobile });

const livestockLine = z.object({ species, count: intField(1, 'Enter the number of head', 100000) });
export const farmRegistrationSchema = z.object({
  name: reqText(150, 'Enter the farm name'),
  type: z.enum(FARM_TYPES, { errorMap: () => ({ message: 'Select the farm type' }) }),
  barangay,
  zone: optText(60),
  address: optText(250),
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  gpsAccuracy: z.preprocess(
    (v) => (v == null || v === '' ? undefined : Number(v)),
    z.number().min(0).optional(),
  ),
  livestock: z
    .array(livestockLine)
    .min(1, 'Add at least one kind of livestock')
    .max(SPECIES.length)
    .refine((l) => new Set(l.map((x) => x.species)).size === l.length, 'List each kind of livestock once'),
});
export type FarmRegistrationInput = z.infer<typeof farmRegistrationSchema>;

export const populationRequestSchema = z.object({
  farmId: intField(1, 'Select a farm'),
  species,
  reason: z.enum(POP_REASONS, { errorMap: () => ({ message: 'Select what happened' }) }),
  /** Number of head added or removed; for a correction, the correct total */
  quantity: intField(0, 'Enter the number of head', 100000),
  note: optText(300),
});
export type PopulationRequestInput = z.infer<typeof populationRequestSchema>;

/** Approve, return for correction (reason needed) or set inactive (reason needed). */
export const registrationDecisionSchema = z
  .object({ decision: z.enum(['APPROVE', 'RETURN', 'INACTIVE']), reason: optText(300), checklist })
  .refine((d) => d.decision === 'APPROVE' || !!d.reason, { path: ['reason'], message: 'Give the reason' });
export const populationDecisionSchema = z
  .object({ decision: z.enum(['ACCEPT', 'CANCEL']), reason: optText(300), checklist })
  .refine((d) => d.decision === 'ACCEPT' || !!d.reason, { path: ['reason'], message: 'Give the reason' });

export const diseaseReportSchema = z
  .object({
    farmId: intField(1, 'Select the farm'),
    species,
    signs: z.array(z.enum(CLINICAL_SIGNS)).max(CLINICAL_SIGNS.length).default([]),
    symptoms: reqText(2000, 'Describe what you see'),
    affected: intField(1, 'Enter how many animals are sick', 100000),
    deaths: intField(0, undefined, 100000).default(0),
    observedAt: pastDate(),
    photoKeys,
    lat: coord(-90, 90).optional(),
    lng: coord(-180, 180).optional(),
    gpsAccuracy: z.preprocess(
      (v) => (v == null || v === '' ? undefined : Number(v)),
      z.number().min(0).optional(),
    ),
  })
  .refine((d) => d.deaths <= d.affected, {
    path: ['deaths'],
    message: 'Cannot be more than the animals affected',
  });
export type DiseaseReportInput = z.infer<typeof diseaseReportSchema>;

export const reportReplySchema = z.object({ text: reqText(2000, 'Type your reply'), photoKeys });
export const reportReviewSchema = z
  .object({
    decision: z.enum(['VALIDATE', 'REQUEST_INFO', 'REJECT']),
    /** The question for the owner, or the reason for rejecting */
    message: optText(2000),
    /** Validate: the suspected disease, who is assigned, or an existing case to attach the report to */
    disease: optText(150),
    assignedToId: z.preprocess(
      (v) => (v === '' || v == null ? undefined : Number(v)),
      z.number().int().positive().optional(),
    ),
    caseId: z.preprocess(
      (v) => (v === '' || v == null ? undefined : Number(v)),
      z.number().int().positive().optional(),
    ),
    /** The reviewer's own assessment (kept on the record, not sent to the owner) */
    assessment: optText(2000),
    /** Planned field visit (validate) */
    visitDate: optDate,
    checklist,
  })
  .refine((d) => d.decision !== 'VALIDATE' || !!d.assessment, {
    path: ['assessment'],
    message: 'Write your assessment',
  })
  .refine((d) => d.decision !== 'VALIDATE' || !!d.caseId || !!d.visitDate, {
    path: ['visitDate'],
    message: 'Set the date of the field visit',
  })
  .refine((d) => d.decision === 'VALIDATE' || !!d.message, {
    path: ['message'],
    message: 'Write a message for the owner',
  })
  .refine((d) => d.decision !== 'VALIDATE' || !!d.caseId || !!d.disease, {
    path: ['disease'],
    message: 'Select the suspected disease',
  });

export const zoneCreateSchema = z.object({
  caseId: intField(1, 'Select the disease report'),
  radiusM: intField(100, 'Select a radius', 20000),
  guidance: optText(2000),
});
export const zoneUpdateSchema = z.object({
  radiusM: intField(100, 'Select a radius', 20000),
  guidance: optText(2000),
});
export const zoneLiftSchema = z.object({ reason });

export const activitySchema = z.object({
  title: reqText(160, 'Enter a title'),
  vaccine: optText(120),
  species: z.union([species, z.literal('All')], { errorMap: () => ({ message: 'Select the livestock' }) }),
  barangay: z.union([barangay, z.literal('ALL')], { errorMap: () => ({ message: 'Select a barangay' }) }),
  date: reqDate,
  time: optText(40),
  venue: optText(200),
  notes: optText(2000),
});
export type ActivityInput = z.infer<typeof activitySchema>;
export const activityStatusSchema = z
  .object({ status: z.enum(ACTIVITY_STATUSES), reason: optText(300) })
  .refine((d) => d.status !== 'CANCELLED' || !!d.reason, { path: ['reason'], message: 'Give the reason' });
export const signupSchema = z.object({
  farmId: intField(1, 'Select a farm'),
  species,
  heads: intField(1, 'Enter the number of head', 100000),
});
export const signupStatusSchema = z.object({ status: z.enum(SIGNUP_STATUSES) });

export const ownerVaccinationSchema = z.object({
  farmId: intField(1, 'Select a farm'),
  species,
  vaccine: reqText(120, 'Enter the vaccine'),
  date: pastDate().refine((v) => !!v, 'Enter the date'),
  heads: intField(1, 'Enter the number of head', 100000),
  givenBy: reqText(120, 'Enter who gave the vaccine'),
  proofKeys: photoKeys,
});
export const decisionSchema = z
  .object({ decision: z.enum(['VERIFY', 'REJECT']), reason: optText(300), checklist })
  .refine((d) => d.decision === 'VERIFY' || !!d.reason, { path: ['reason'], message: 'Give the reason' });

export const serviceRequestSchema = z.object({
  farmId: intField(1, 'Select a farm'),
  serviceType: z.enum(SERVICE_TYPES, { errorMap: () => ({ message: 'Select the service' }) }),
  species: species.optional(),
  note: optText(500),
  preferredDate: optDate,
});
export const serviceRequestUpdateSchema = z
  .object({
    status: z.enum(['SCHEDULED', 'DONE', 'DECLINED']),
    scheduledDate: optDate,
    scheduledTime: optText(40),
    response: optText(300),
  })
  .refine((d) => d.status !== 'SCHEDULED' || !!d.scheduledDate, {
    path: ['scheduledDate'],
    message: 'Enter the date',
  })
  .refine((d) => d.status !== 'DECLINED' || !!d.response, { path: ['response'], message: 'Give the reason' });

export const announcementSchema = z
  .object({
    title: reqText(160, 'Enter a title'),
    body: reqText(5000, 'Write the announcement'),
    audience: z.enum(ANNOUNCEMENT_AUDIENCES),
    barangay: z.preprocess((v) => (v === '' ? undefined : v), barangay.optional()),
    zoneId: z.preprocess(
      (v) => (v === '' || v == null ? undefined : Number(v)),
      z.number().int().positive().optional(),
    ),
  })
  .refine((d) => d.audience !== 'BARANGAY' || !!d.barangay, {
    path: ['barangay'],
    message: 'Select a barangay',
  })
  .refine((d) => d.audience !== 'ZONE' || !!d.zoneId, {
    path: ['zoneId'],
    message: 'Select a monitoring zone',
  });
export const withdrawSchema = z.object({ reason });

export const notifPrefsSchema = z.object({ muted: z.array(z.enum(OPTIONAL_NOTIFICATION_TYPES)).default([]) });
