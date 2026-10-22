import type { CaseStatus } from '@livestock/shared';

export interface FarmSummary {
  id: number;
  code: string;
  name: string;
  type: string;
  barangay: string;
  zone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  mapped: boolean;
  ownerId: number;
  ownerName: string;
  ownerContact: string | null;
  total: number;
  tagged: number;
  groups: number;
  species: { species: string; count: number }[];
  recordStatus: 'verified' | 'overdue' | 'outdated' | 'no_groups';
  recordStatusLabel: string;
}

export interface CaseRow {
  id: number;
  code: string;
  disease: string;
  species: string;
  status: CaseStatus;
  statusLabel: string;
  reportedAt: string;
  symptomsDate: string | null;
  barangay: string;
  zone: string | null;
  affected: number;
  deaths: number;
  lat: number | null;
  lng: number | null;
  mapped: boolean;
  locationSource: string | null;
  ownerId: number;
  ownerName: string | null;
  farmId: number;
  farmName: string | null;
  reportedBy: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  symptoms: string | null;
  sampleInfo: string | null;
  remarks: string | null;
  photoKeys: string[];
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  closureNote: string | null;
  relatedCaseId: number | null;
  relatedCaseCode: string | null;
}

export interface VaccinationRow {
  id: number;
  code: string;
  date: string;
  nextDate: string | null;
  vaccine: string;
  species: string;
  target: 'GROUP' | 'ANIMAL';
  targetLabel: string;
  count: number;
  doseNumber: number;
  batch: string | null;
  administeredBy: string | null;
  farmId: number;
  farmName: string | null;
  barangay: string | null;
  reminderDone: boolean;
  voided: boolean;
  voidedBy: string | null;
  voidReason: string | null;
}

export interface TransferRow {
  id: number;
  code: string;
  date: string;
  animalId: number;
  animalCode: string;
  earTag: string | null;
  fromOwnerName: string;
  fromFarmName: string;
  toOwnerName: string;
  toFarmName: string;
  type: 'TRANSFER' | 'REVERSAL';
  remarks: string | null;
}

export interface CoverageRow {
  species: string;
  population: number;
  tagged: number;
  estimatedHeads: number;
  estimatedPct: number;
  exactVaccinated: number;
  exactPct: number | null;
  events: number;
  doses: number;
}

export interface Overview {
  stats: {
    owners: number;
    farms: number;
    outdatedFarms: number;
    livestock: number;
    verifiedPct: number;
    suspected: number;
    inLab: number;
    positive: number;
    coveragePct: number;
    awaitingGeotag: number;
  };
  map: {
    farms: FarmSummary[];
    cases: {
      id: number;
      code: string;
      disease: string;
      status: CaseStatus;
      lat: number;
      lng: number;
      farmName: string;
      barangay: string;
    }[];
  };
  recent: { id: number; summary: string; byName: string | null; at: string; entityId: number }[];
  bySpecies: { species: string; count: number }[];
  byBarangay: { barangay: string; count: number }[];
  trend: {
    month: string;
    label: string;
    verified: number;
    carried: number;
    adjusted: number;
    total: number;
  }[];
  casesPerMonth: { month: string; label: string; reported: number; positive: number }[];
  coverage: CoverageRow[];
  attention: { label: string; kind: string; href: string }[];
  casesByStatus: { status: CaseStatus; label: string; count: number }[];
  casesByDisease: { disease: string; count: number }[];
  vaccinationActivity: { month: string; label: string; events: number; doses: number }[];
  farmsByType: { type: string; count: number }[];
  largestFarms: { id: number; name: string; total: number }[];
}

export interface RadiusResult {
  case: CaseRow;
  radius: number;
  geocoded: boolean;
  center: { lat: number; lng: number } | null;
  farms: (FarmSummary & { distance: number; role: string })[];
  totals: {
    farms: number;
    nearby: number;
    groundZero: number;
    livestock: number;
    owners: number;
    species: { species: string; count: number }[];
  } | null;
  excluded: number;
}