/** Domain constants shared by the API and the PWA. */

export const BARANGAYS = [
  'Abella',
  'Bagumbayan Norte',
  'Bagumbayan Sur',
  'Balatas',
  'Calauag',
  'Cararayan',
  'Carolina',
  'Concepcion Grande',
  'Concepcion Pequeña',
  'Dayangdang',
  'Del Rosario',
  'Dinaga',
  'Igualdad Interior',
  'Lerma',
  'Liboton',
  'Mabolo',
  'Pacol',
  'Panicuason',
  'Peñafrancia',
  'Sabang',
  'San Felipe',
  'San Francisco',
  'San Isidro',
  'Santa Cruz',
  'Tabuco',
  'Tinago',
  'Triangulo',
] as const;
export type Barangay = (typeof BARANGAYS)[number];

/** Approximate barangay centroids — used to centre maps and as fallbacks. */
export const BARANGAY_CENTERS: Partial<Record<Barangay, [number, number]>> = {
  Balatas: [13.633, 123.198],
  Cararayan: [13.638, 123.238],
  Carolina: [13.664, 123.272],
  'Concepcion Grande': [13.618, 123.206],
  'Del Rosario': [13.613, 123.219],
  Mabolo: [13.62, 123.18],
  Pacol: [13.655, 123.224],
  Panicuason: [13.672, 123.3],
  'San Felipe': [13.641, 123.205],
  'San Isidro': [13.668, 123.255],
};

export const NAGA_CENTER: [number, number] = [13.636, 123.235];

export const SPECIES = [
  'Cattle',
  'Carabao',
  'Swine',
  'Goat',
  'Sheep',
  'Chicken',
  'Duck',
  'Other Poultry',
  'Other',
] as const;
export type Species = (typeof SPECIES)[number];

export const SPECIES_COLORS: Record<Species, string> = {
  Cattle: '#92400e',
  Carabao: '#475569',
  Swine: '#ec4899',
  Goat: '#d97706',
  Sheep: '#7c3aed',
  Chicken: '#eab308',
  Duck: '#06b6d4',
  'Other Poultry': '#0d9488',
  Other: '#9ca3af',
};

/** Letter used in generated animal IDs, e.g. NC-C-0001 for cattle. */
export const SPECIES_ID_LETTER: Record<Species, string> = {
  Cattle: 'C',
  Carabao: 'K',
  Swine: 'S',
  Goat: 'G',
  Sheep: 'H',
  Chicken: 'P',
  Duck: 'D',
  'Other Poultry': 'Q',
  Other: 'X',
};

export const FARM_TYPES = ['backyard', 'commercial', 'pasture', 'mixed', 'poultry'] as const;
export type FarmType = (typeof FARM_TYPES)[number];

export const SEXES = ['Mixed', 'Male', 'Female'] as const;
export const LIFE_STAGES = ['Mixed', 'young', 'grower', 'adult', 'breeder'] as const;
export const HEALTH_STATUSES = ['Healthy', 'Sick', 'Under treatment', 'Quarantined'] as const;

export const OWNER_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type OwnerStatus = (typeof OWNER_STATUSES)[number];

export const ANIMAL_STATUSES = ['ACTIVE', 'SOLD', 'DECEASED', 'MISSING', 'SLAUGHTERED'] as const;
export type AnimalStatus = (typeof ANIMAL_STATUSES)[number];

export const CASE_STATUSES = [
  'SUSPECTED',
  'SAMPLE_COLLECTED',
  'SENT_TO_LAB',
  'AWAITING_RESULT',
  'POSITIVE',
  'NEGATIVE',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  SUSPECTED: 'Suspected Case Reported',
  SAMPLE_COLLECTED: 'Sample Collected',
  SENT_TO_LAB: 'Sent to Laboratory',
  AWAITING_RESULT: 'Awaiting Result',
  POSITIVE: 'Positive',
  NEGATIVE: 'Negative',
};

/** Snake-case codes used in status history notes ("Advanced to sent_to_lab"). */
export const CASE_STATUS_CODES: Record<CaseStatus, string> = {
  SUSPECTED: 'suspected',
  SAMPLE_COLLECTED: 'sample_collected',
  SENT_TO_LAB: 'sent_to_lab',
  AWAITING_RESULT: 'awaiting_result',
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
};

/** Map marker category for a case status. */
export type CaseMarkerKind = 'suspected' | 'lab' | 'positive' | 'negative';
export function caseMarkerKind(status: CaseStatus): CaseMarkerKind {
  if (status === 'POSITIVE') return 'positive';
  if (status === 'NEGATIVE') return 'negative';
  if (status === 'SENT_TO_LAB' || status === 'AWAITING_RESULT') return 'lab';
  return 'suspected';
}
export const CASE_MARKER_COLORS: Record<CaseMarkerKind, string> = {
  suspected: '#f97316',
  lab: '#f59e0b',
  positive: '#dc2626',
  negative: '#94a3b8',
};

export const LAB_RESULTS = ['PENDING', 'POSITIVE', 'NEGATIVE', 'INCONCLUSIVE'] as const;
export type LabResult = (typeof LAB_RESULTS)[number];

export const RESPONSE_TYPES = [
  'OWNER_NOTIFICATION',
  'ASF_CHECKPOINT',
  'QUARANTINE',
  'DISINFECTION',
  'MOVEMENT_RESTRICTION',
  'CULLING_DEPOPULATION',
  'SURVEILLANCE_VISIT',
  'OTHER',
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];
export const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  OWNER_NOTIFICATION: 'Owner Notification',
  ASF_CHECKPOINT: 'Asf Checkpoint',
  QUARANTINE: 'Quarantine',
  DISINFECTION: 'Disinfection',
  MOVEMENT_RESTRICTION: 'Movement Restriction',
  CULLING_DEPOPULATION: 'Culling / Depopulation',
  SURVEILLANCE_VISIT: 'Surveillance Visit',
  OTHER: 'Other',
};

export const STRAY_STATUSES = ['REPORTED', 'IMPOUNDED', 'RELEASED', 'CLOSED'] as const;
export type StrayStatus = (typeof STRAY_STATUSES)[number];

export const TRANSFER_TYPES = ['TRANSFER', 'REVERSAL'] as const;
export const VACCINATION_TARGETS = ['GROUP', 'ANIMAL'] as const;

export const ROLES = ['ADMIN', 'STAFF', 'READONLY'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  STAFF: 'Staff',
  READONLY: 'Read-only',
};

export const PCIC_STATUSES = ['ACTIVE', 'EXPIRED', 'CLAIMED', 'CANCELLED'] as const;

/** Default assessment radii offered on radius analysis (metres). */
export const RADIUS_PRESETS = [500, 1000, 3000, 5000] as const;

export const OFFICE_NAME = 'City Veterinary Office — Naga City';

/** Photo upload limits (applied in every form that takes photos, and on the server). */
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_MB = 5;
