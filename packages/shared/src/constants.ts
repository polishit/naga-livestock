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

/** Farm scale. What the farm raises (piggery, cattle-only…) is worked out from its population. */
export const FARM_TYPES = ['backyard', 'commercial'] as const;
export type FarmType = (typeof FARM_TYPES)[number];
export const FARM_TYPE_LABELS: Record<FarmType, string> = {
  backyard: 'Backyard (BY)',
  commercial: 'Commercial (CM)',
};

/** Type of livestock raised, worked out from the species on the farm. */
export const LIVESTOCK_RAISED = [
  'Piggery',
  'Cattle Only',
  'Carabao Only',
  'Goat Only',
  'Sheep Only',
  'Poultry',
  'Mixed',
  'No Livestock Yet',
] as const;
export type LivestockRaised = (typeof LIVESTOCK_RAISED)[number];
const POULTRY: string[] = ['Chicken', 'Duck', 'Other Poultry'];
export function livestockRaised(species: string[]): LivestockRaised {
  const set = [...new Set(species)];
  if (!set.length) return 'No Livestock Yet';
  if (set.every((s) => POULTRY.includes(s))) return 'Poultry';
  if (set.length > 1) return 'Mixed';
  const one: Record<string, LivestockRaised> = {
    Swine: 'Piggery',
    Cattle: 'Cattle Only',
    Carabao: 'Carabao Only',
    Goat: 'Goat Only',
    Sheep: 'Sheep Only',
  };
  return one[set[0]] ?? 'Mixed';
}

/** Where the office got an owner or farm record (the office gathers data; raisers do not self-register). */
export const RECORD_SOURCES = ['DA_LIST', 'FARM_VISIT', 'BARANGAY', 'OTHER'] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];
export const RECORD_SOURCE_LABELS: Record<RecordSource, string> = {
  DA_LIST: 'DA Masterlist',
  FARM_VISIT: 'Farm Visit',
  BARANGAY: 'Barangay Referral',
  OTHER: 'Other',
};

/** Standard livestock classifications per species: production stage, with the sex and age group it implies. */
export interface Classification {
  code: string;
  label: string;
  sex: 'Male' | 'Female' | 'Mixed';
  age: 'Young' | 'Grower' | 'Adult';
}
const c = (code: string, label: string, sex: Classification['sex'], age: Classification['age']) => ({
  code,
  label,
  sex,
  age,
});
export const CLASSIFICATIONS: Record<Species, Classification[]> = {
  Swine: [
    c('piglet', 'Piglet', 'Mixed', 'Young'),
    c('weaner', 'Weaner', 'Mixed', 'Young'),
    c('grower', 'Grower / Finisher', 'Mixed', 'Grower'),
    c('gilt', 'Gilt', 'Female', 'Grower'),
    c('sow', 'Sow', 'Female', 'Adult'),
    c('boar', 'Boar', 'Male', 'Adult'),
  ],
  Cattle: [
    c('calf', 'Calf', 'Mixed', 'Young'),
    c('heifer', 'Heifer', 'Female', 'Grower'),
    c('bullock', 'Bullock / Steer', 'Male', 'Grower'),
    c('cow', 'Cow', 'Female', 'Adult'),
    c('bull', 'Bull', 'Male', 'Adult'),
  ],
  Carabao: [
    c('calf', 'Calf', 'Mixed', 'Young'),
    c('heifer', 'Heifer', 'Female', 'Grower'),
    c('bullock', 'Bullock', 'Male', 'Grower'),
    c('caracow', 'Caracow', 'Female', 'Adult'),
    c('carabull', 'Carabull', 'Male', 'Adult'),
  ],
  Goat: [
    c('kid', 'Kid', 'Mixed', 'Young'),
    c('doeling', 'Doeling', 'Female', 'Grower'),
    c('buckling', 'Buckling', 'Male', 'Grower'),
    c('doe', 'Doe', 'Female', 'Adult'),
    c('buck', 'Buck', 'Male', 'Adult'),
  ],
  Sheep: [
    c('lamb', 'Lamb', 'Mixed', 'Young'),
    c('ewe', 'Ewe', 'Female', 'Adult'),
    c('ram', 'Ram', 'Male', 'Adult'),
  ],
  Chicken: [
    c('chick', 'Chick', 'Mixed', 'Young'),
    c('pullet', 'Pullet', 'Female', 'Grower'),
    c('broiler', 'Broiler', 'Mixed', 'Grower'),
    c('layer', 'Layer / Hen', 'Female', 'Adult'),
    c('rooster', 'Rooster', 'Male', 'Adult'),
  ],
  Duck: [
    c('duckling', 'Duckling', 'Mixed', 'Young'),
    c('grower', 'Grower', 'Mixed', 'Grower'),
    c('layer', 'Layer', 'Female', 'Adult'),
    c('drake', 'Drake', 'Male', 'Adult'),
  ],
  'Other Poultry': [
    c('young', 'Young', 'Mixed', 'Young'),
    c('female', 'Adult Female', 'Female', 'Adult'),
    c('male', 'Adult Male', 'Male', 'Adult'),
  ],
  Other: [c('young', 'Young', 'Mixed', 'Young'), c('adult', 'Adult', 'Mixed', 'Adult')],
};
export type Breakdown = Record<string, number>;
/** Classification label for a code within a species (falls back to the code). */
export const classLabel = (species: string, code: string) =>
  CLASSIFICATIONS[species as Species]?.find((x) => x.code === code)?.label ?? code;
/** Totals of a breakdown grouped by sex, age group and production stage. */
export function summarizeBreakdown(species: string, b: Breakdown | null | undefined) {
  const list = CLASSIFICATIONS[species as Species] ?? CLASSIFICATIONS.Other;
  const bySex: Record<string, number> = {};
  const byAge: Record<string, number> = {};
  const byStage: { code: string; label: string; count: number }[] = [];
  for (const k of list) {
    const n = b?.[k.code] ?? 0;
    byStage.push({ code: k.code, label: k.label, count: n });
    if (!n) continue;
    bySex[k.sex] = (bySex[k.sex] ?? 0) + n;
    byAge[k.age] = (byAge[k.age] ?? 0) + n;
  }
  const total = byStage.reduce((a, x) => a + x.count, 0);
  return { bySex, byAge, byStage, total };
}

/** One-line summary of a breakdown, e.g. "Sow 4 · Piglet 20 · Boar 1" (empty when not classified). */
export function breakdownText(species: string, b: Breakdown | null | undefined) {
  const list = CLASSIFICATIONS[species as Species] ?? CLASSIFICATIONS.Other;
  return list
    .filter((k) => (b?.[k.code] ?? 0) > 0)
    .map((k) => `${k.label} ${b![k.code]}`)
    .join(' · ');
}

/** Veterinary services recorded on the Deworming & Veterinary Services page (deworming is the main one). */
export const SERVICE_TYPES = [
  'DEWORMING',
  'VACCINATION',
  'CHECKUP',
  'PREGNANCY_DIAGNOSIS',
  'INSEMINATION',
  'TREATMENT',
  'OTHER',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  DEWORMING: 'Deworming',
  VACCINATION: 'Vaccination',
  CHECKUP: 'Veterinary Check-up',
  PREGNANCY_DIAGNOSIS: 'Pregnancy Diagnosis',
  INSEMINATION: 'Artificial Insemination',
  TREATMENT: 'Treatment',
  OTHER: 'Other Field Service',
};
/** Cattle and carabao (large ruminants): pregnancy diagnosis, insemination, purpose and the ownership certificate. */
export const LARGE_RUMINANTS = ['Cattle', 'Carabao'] as const;
export const isLargeRuminant = (species: string) => (LARGE_RUMINANTS as readonly string[]).includes(species);
/** Services given to cattle and carabao only. */
export const LARGE_RUMINANT_SERVICES: ServiceType[] = ['PREGNANCY_DIAGNOSIS', 'INSEMINATION'];
/** The services counted per species in the monthly report. */
export const MONTHLY_SERVICES: ServiceType[] = [
  'DEWORMING',
  'PREGNANCY_DIAGNOSIS',
  'INSEMINATION',
  'CHECKUP',
];
export const PD_RESULTS = ['PREGNANT', 'NOT_PREGNANT'] as const;
export type PdResult = (typeof PD_RESULTS)[number];
export const PD_RESULT_LABELS: Record<PdResult, string> = {
  PREGNANT: 'Pregnant',
  NOT_PREGNANT: 'Not pregnant',
};

/** Purpose of cattle and carabao (as on the PCIC application). */
export const ANIMAL_PURPOSES = ['DRAFT', 'DAIRY', 'FATTENING', 'BREEDING'] as const;
export type AnimalPurpose = (typeof ANIMAL_PURPOSES)[number];
export const ANIMAL_PURPOSE_LABELS: Record<AnimalPurpose, string> = {
  DRAFT: 'Draft',
  DAIRY: 'Dairy',
  FATTENING: 'Fattening',
  BREEDING: 'Breeding',
};

/** PCIC livestock mortality insurance application. */
export const PCIC_APPLICATION_TYPES = ['NEW', 'RENEWAL'] as const;
export const PCIC_APPLICATION_LABELS: Record<(typeof PCIC_APPLICATION_TYPES)[number], string> = {
  NEW: 'New application',
  RENEWAL: 'Renewal',
};
/** Species listed first in service forms (the office deworms goats and cattle most). */
export const SERVICE_SPECIES_ORDER = [
  'Goat',
  'Cattle',
  'Carabao',
  'Swine',
  'Sheep',
  'Chicken',
  'Duck',
  'Other Poultry',
  'Other',
] as const;

/** Farm visits: why the visit was made and what was found. */
export const VISIT_PURPOSES = ['ROUTINE', 'DEWORMING', 'CHECKUP', 'MONITORING', 'OTHER'] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];
export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  ROUTINE: 'Routine / Masterlist Update',
  DEWORMING: 'Deworming',
  CHECKUP: 'Veterinary Check-up',
  MONITORING: 'Disease Monitoring',
  OTHER: 'Other',
};
export const VISIT_FINDINGS = ['NO_SIGNS', 'SICK_ANIMALS'] as const;
export type VisitFinding = (typeof VISIT_FINDINGS)[number];
export const VISIT_FINDING_LABELS: Record<VisitFinding, string> = {
  NO_SIGNS: 'No signs of disease',
  SICK_ANIMALS: 'Sick animals found',
};

/** Diseases monitored by the office (ASF first). "Other" lets staff type a different disease. */
export const MONITORED_DISEASES = [
  'African Swine Fever (ASF)',
  'Classical Swine Fever (Hog Cholera)',
  'Foot and Mouth Disease (FMD)',
  'Hemorrhagic Septicemia',
  'Avian Influenza (Bird Flu)',
  'Newcastle Disease',
  'Porcine Reproductive and Respiratory Syndrome (PRRS)',
  'Swine Erysipelas',
  'Surra (Trypanosomiasis)',
  'Anthrax',
] as const;

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
  'POSITIVE',
  'NEGATIVE',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  SUSPECTED: 'Suspected Case Reported',
  SAMPLE_COLLECTED: 'Sample Collected',
  SENT_TO_LAB: 'Sent to Laboratory',
  POSITIVE: 'Positive',
  NEGATIVE: 'Negative',
};

/** Position of each status in the surveillance workflow (Positive and Negative are both final). */
export const CASE_STAGE: Record<CaseStatus, number> = {
  SUSPECTED: 0,
  SAMPLE_COLLECTED: 1,
  SENT_TO_LAB: 2,
  POSITIVE: 3,
  NEGATIVE: 3,
};

/**
 * A case's status is never typed in: it follows from its laboratory samples (voided ones left out).
 * - any positive result → Positive
 * - a sample sent and waiting for its result → Sent to Laboratory
 * - a sample collected, not sent yet → Sample Collected
 * - a negative result (nothing positive or waiting) → Negative
 * - no sample yet, or only inconclusive results → Suspected (a new sample is needed)
 */
export function deriveCaseStatus(
  labs: { result: string; sentAt?: string | Date | null; voided?: boolean }[],
): CaseStatus {
  const l = labs.filter((x) => !x.voided);
  if (l.some((x) => x.result === 'POSITIVE')) return 'POSITIVE';
  if (l.some((x) => x.result === 'PENDING' && x.sentAt)) return 'SENT_TO_LAB';
  if (l.some((x) => x.result === 'PENDING')) return 'SAMPLE_COLLECTED';
  if (l.some((x) => x.result === 'NEGATIVE')) return 'NEGATIVE';
  return 'SUSPECTED';
}

/** True when every sample tested so far came back inconclusive (a new sample has to be taken). */
export function onlyInconclusive(labs: { result: string; voided?: boolean }[]) {
  const l = labs.filter((x) => !x.voided);
  return l.length > 0 && l.every((x) => x.result === 'INCONCLUSIVE');
}

/** Snake-case codes used in status history notes ("Advanced to sent_to_lab"). */
export const CASE_STATUS_CODES: Record<CaseStatus, string> = {
  SUSPECTED: 'suspected',
  SAMPLE_COLLECTED: 'sample_collected',
  SENT_TO_LAB: 'sent_to_lab',
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
};

/** Map marker category for a case status. */
export type CaseMarkerKind = 'suspected' | 'lab' | 'positive' | 'negative';
export function caseMarkerKind(status: CaseStatus): CaseMarkerKind {
  if (status === 'POSITIVE') return 'positive';
  if (status === 'NEGATIVE') return 'negative';
  if (status === 'SENT_TO_LAB') return 'lab';
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
  'BARANGAY_COORDINATION',
  'FARMER_EDUCATION',
  'DA_COORDINATION',
  'QUARANTINE',
  'MOVEMENT_RESTRICTION',
  'CULLING_DEPOPULATION',
  'DISINFECTION',
  'ASF_CHECKPOINT',
  'SURVEILLANCE_VISIT',
  'OTHER',
] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];
export const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  OWNER_NOTIFICATION: 'Owner Notification',
  BARANGAY_COORDINATION: 'Barangay Coordination',
  FARMER_EDUCATION: 'Farmer Education',
  DA_COORDINATION: 'DA Representative (Documentation)',
  QUARANTINE: 'Quarantine',
  MOVEMENT_RESTRICTION: 'Movement Restriction',
  CULLING_DEPOPULATION: 'Culling / Depopulation',
  DISINFECTION: 'Disinfection / Decontamination',
  ASF_CHECKPOINT: 'ASF Checkpoint',
  SURVEILLANCE_VISIT: 'Surveillance Visit',
  OTHER: 'Other',
};

/** The City Veterinary Office's response steps for an African Swine Fever case, in order. */
export const ASF_RESPONSE_STEPS: { type: ResponseType; label: string }[] = [
  { type: 'OWNER_NOTIFICATION', label: 'Inform the owner' },
  { type: 'FARMER_EDUCATION', label: 'Educate the farmer (biosecurity, cleaning)' },
  { type: 'DA_COORDINATION', label: 'Write to the DA for a representative (documentation)' },
  { type: 'BARANGAY_COORDINATION', label: 'Coordinate with barangay officials' },
  { type: 'CULLING_DEPOPULATION', label: 'Euthanize the remaining pigs and bury them on the farm' },
  { type: 'DISINFECTION', label: 'Clean and disinfect the premises' },
  { type: 'ASF_CHECKPOINT', label: 'Activate checkpoints' },
];
/** A case is treated as ASF when its disease name says so. */
export const isAsfDisease = (disease: string) => /\basf\b|african swine fever/i.test(disease);

/** Status of a response activity (a planned activity may have a future date). */
export const RESPONSE_STATUSES = ['PLANNED', 'ONGOING', 'COMPLETED'] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];
export const RESPONSE_STATUS_LABELS: Record<ResponseStatus, string> = {
  PLANNED: 'Planned',
  ONGOING: 'Ongoing',
  COMPLETED: 'Completed',
};
/** Response types that last for a period (an end / lifting date applies). */
export const RESPONSE_TYPES_WITH_END: ResponseType[] = [
  'QUARANTINE',
  'MOVEMENT_RESTRICTION',
  'ASF_CHECKPOINT',
];
/** Response types done at a specific place (checkpoint location, disinfection site…). */
export const RESPONSE_TYPES_WITH_LOCATION: ResponseType[] = [
  'BARANGAY_COORDINATION',
  'FARMER_EDUCATION',
  'ASF_CHECKPOINT',
  'DISINFECTION',
  'MOVEMENT_RESTRICTION',
  'CULLING_DEPOPULATION',
];
/**
 * A response measure still needs attention: it is planned, still going on, or (quarantine,
 * movement restriction, checkpoint) its lifting date has not come yet. A measure with a lifting
 * date in the past counts as lifted.
 */
export function measureOpen(
  r: { type: string; status: string; endDate?: string | null; voided?: boolean },
  today: string,
) {
  if (r.voided) return false;
  if (r.status === 'PLANNED') return true;
  if (RESPONSE_TYPES_WITH_END.includes(r.type as ResponseType) && r.endDate) return r.endDate > today;
  return r.status === 'ONGOING';
}

export const DISPOSAL_METHODS = [
  'Burial on the farm',
  'Burial',
  'Burning / incineration',
  'Rendering',
  'Composting',
  'Other',
] as const;

export const INVESTIGATION_VISIT_TYPES = ['INITIAL', 'FOLLOW_UP', 'TRACING', 'FINAL'] as const;
export type InvestigationVisitType = (typeof INVESTIGATION_VISIT_TYPES)[number];
export const INVESTIGATION_VISIT_LABELS: Record<InvestigationVisitType, string> = {
  INITIAL: 'Initial visit',
  FOLLOW_UP: 'Follow-up visit',
  TRACING: 'Contact tracing',
  FINAL: 'Final inspection',
};

/** Suggested laboratory tests, as listed on the RADDL Analysis Request Form (free text is also accepted). */
export const LAB_TEST_METHODS = [
  'PCR – African Swine Fever (ASF)',
  'ELISA – African Swine Fever Virus (ASFV)',
  'ELISA – Classical Swine Fever Virus (CSFV)',
  'ELISA – Porcine Reproductive and Respiratory Syndrome (PRRSV)',
  'PCR – Avian Influenza A',
  'HI – Newcastle Disease',
  'ELISA – Brucellosis',
  'Rapid Plate Test – Brucella spp.',
  'Fecalysis',
  'Blood parasite examination',
  'Gross examination / Necropsy',
  'Bacterial isolation & identification',
  'Rapid antigen test',
] as const;
export const DEFAULT_LAB_TEST = LAB_TEST_METHODS[0];
export const DEFAULT_LABORATORY = 'RADDL Region V, San Agustin, Pili, Camarines Sur';

/** Specimen types on the Analysis Request and Sample Collection forms. */
export const SPECIMEN_TYPES = [
  'Blood',
  'Serum',
  'Tissue / Organs',
  'Swab',
  'Feces',
  'Blood smear',
  'Whole animal',
  'Other',
] as const;
/** Organs taken from a dead animal (ASF: spleen, lymph node, liver). */
export const SAMPLE_ORGANS = ['Spleen', 'Lymph node', 'Liver', 'Kidney', 'Lung', 'Tonsil'] as const;
/** The specimen usually taken: blood from a live animal, organs from a dead one. */
export const specimenFor = (condition?: string | null) =>
  condition === 'DEAD' ? 'Tissue / Organs' : 'Blood';
export const ANIMAL_CONDITIONS = ['LIVE', 'DEAD'] as const;
export const ANIMAL_CONDITION_LABELS: Record<(typeof ANIMAL_CONDITIONS)[number], string> = {
  LIVE: 'Live',
  DEAD: 'Dead',
};
/** How a laboratory result reached the office (negative results usually come by email). */
export const RESULT_RECEIVED_VIA = ['EMAIL', 'HARD_COPY', 'PHONE', 'OTHER'] as const;
export const RESULT_RECEIVED_LABELS: Record<(typeof RESULT_RECEIVED_VIA)[number], string> = {
  EMAIL: 'Email',
  HARD_COPY: 'Hard copy',
  PHONE: 'Phone / text',
  OTHER: 'Other',
};
/** Why samples are sent (Analysis Request Form "Purpose"). */
export const LAB_PURPOSES = [
  'SURVEILLANCE',
  'DISEASE_INVESTIGATION',
  'DIAGNOSTICS',
  'LOCAL_SHIPMENT',
  'REGULATORY',
  'FARM_ACCREDITATION',
  'OTHER',
] as const;
export type LabPurpose = (typeof LAB_PURPOSES)[number];
export const LAB_PURPOSE_LABELS: Record<LabPurpose, string> = {
  SURVEILLANCE: 'Surveillance',
  DISEASE_INVESTIGATION: 'Disease Investigation',
  DIAGNOSTICS: 'Diagnostics',
  LOCAL_SHIPMENT: 'Local Shipment',
  REGULATORY: 'Regulatory',
  FARM_ACCREDITATION: 'Farm Accreditation',
  OTHER: 'Others',
};

/** Clinical signs asked about when a disease is reported (ASF signs first). */
export const CLINICAL_SIGNS = [
  'FEVER',
  'NO_APPETITE',
  'WEAKNESS',
  'SKIN_REDNESS',
  'VOMITING',
  'DIARRHEA',
  'BREATHING',
  'DISCHARGE',
  'ABORTION',
  'SUDDEN_DEATH',
] as const;
export type ClinicalSign = (typeof CLINICAL_SIGNS)[number];
export const CLINICAL_SIGN_LABELS: Record<ClinicalSign, string> = {
  FEVER: 'High fever',
  NO_APPETITE: 'Loss of appetite',
  WEAKNESS: 'Weakness / lying down',
  SKIN_REDNESS: 'Red or purple skin (ears, belly, legs)',
  VOMITING: 'Vomiting',
  DIARRHEA: 'Diarrhea (may be bloody)',
  BREATHING: 'Coughing / hard breathing',
  DISCHARGE: 'Nose or eye discharge',
  ABORTION: 'Abortion',
  SUDDEN_DEATH: 'Sudden death',
};

/**
 * How the office classifies a case (its own words), worked out from the records:
 * Reported (not visited yet) → Suspected (visited, not confirmed) → Active (positive) → Closed;
 * a negative result that is not closed yet is shown as Negative.
 */
export const CASE_CLASSES = ['REPORTED', 'SUSPECTED', 'ACTIVE', 'NEGATIVE', 'CLOSED'] as const;
export type CaseClass = (typeof CASE_CLASSES)[number];
export const CASE_CLASS_LABELS: Record<CaseClass, string> = {
  REPORTED: 'Reported',
  SUSPECTED: 'Suspected',
  ACTIVE: 'Active',
  NEGATIVE: 'Negative',
  CLOSED: 'Closed',
};
export function caseClass(c: { status: string; closed: boolean; visited: boolean }): CaseClass {
  if (c.closed) return 'CLOSED';
  if (c.status === 'POSITIVE') return 'ACTIVE';
  if (c.status === 'NEGATIVE') return 'NEGATIVE';
  // A sample already taken means someone was at the farm.
  return c.visited || c.status !== 'SUSPECTED' ? 'SUSPECTED' : 'REPORTED';
}

/** How a closed case ended. */
export const CASE_OUTCOMES = ['RESOLVED', 'CONTAINED', 'DEPOPULATED', 'NOT_CONFIRMED', 'OTHER'] as const;
export type CaseOutcome = (typeof CASE_OUTCOMES)[number];
export const CASE_OUTCOME_LABELS: Record<CaseOutcome, string> = {
  RESOLVED: 'Resolved — animals recovered',
  CONTAINED: 'Contained — no further spread',
  DEPOPULATED: 'Depopulated — affected animals culled',
  NOT_CONFIRMED: 'Disease not confirmed',
  OTHER: 'Other',
};

/** The closing reasons that fit a case's result (a negative or untested case cannot be "depopulated"). */
export function caseOutcomesFor(status: CaseStatus): CaseOutcome[] {
  return status === 'POSITIVE'
    ? ['CONTAINED', 'DEPOPULATED', 'RESOLVED', 'OTHER']
    : ['NOT_CONFIRMED', 'RESOLVED', 'OTHER'];
}

/**
 * What still stops a case from being closed. Empty → it can be closed. A case can be closed
 * without any laboratory test (false alarm, animals recovered), but not while a sample is still
 * waiting for its result, a measure is still in force, or the head count is not yet updated.
 */
export function caseCloseBlockers(
  x: {
    labs: { result: string; voided?: boolean }[];
    responses: { type: string; status: string; endDate?: string | null; voided?: boolean }[];
    pendingPopulation: number;
  },
  today: string,
): string[] {
  const out: string[] = [];
  const waiting = x.labs.filter((l) => !l.voided && l.result === 'PENDING').length;
  if (waiting)
    out.push(`${waiting} sample${waiting === 1 ? ' is' : 's are'} still waiting for a laboratory result.`);
  const open = x.responses.filter((r) => measureOpen(r, today)).length;
  if (open)
    out.push(
      `${open} response measure${open === 1 ? ' is' : 's are'} still planned, ongoing or in force. Mark ${open === 1 ? 'it' : 'them'} completed or enter the date lifted.`,
    );
  if (x.pendingPopulation > 0)
    out.push(
      `${x.pendingPopulation} animal(s) that died or were culled are not yet taken off the farm's head count.`,
    );
  return out;
}

/** A stray incident is open (reported) or closed. */
export const STRAY_STATUSES = ['REPORTED', 'CLOSED'] as const;
export type StrayStatus = (typeof STRAY_STATUSES)[number];

/** Kinds of stray-livestock violation (the list in the incident form). */
export const STRAY_VIOLATION_TYPES = [
  'Stray / roaming animal',
  'Animal on a public road or highway',
  'Damage to crops or property',
  'Unregistered or untagged animal',
  'Repeat offense',
  'Other',
] as const;

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
