export type ReportCategory = 'summary' | 'population' | 'disease' | 'outbreak' | 'vaccination' | 'ownership';

export interface ReportTypeDef {
  id: string;
  title: string;
  category: ReportCategory;
}

export const REPORT_CATEGORIES: { id: ReportCategory; label: string }[] = [
  { id: 'summary', label: 'Accomplishment' },
  { id: 'population', label: 'Population' },
  { id: 'disease', label: 'Disease Monitoring' },
  { id: 'outbreak', label: 'Outbreak' },
  { id: 'vaccination', label: 'Vaccination' },
  { id: 'ownership', label: 'Ownership & Incidents' },
];

/** All exportable report types. */
export const REPORT_TYPES: ReportTypeDef[] = [
  { id: 'accomplishment', title: 'Accomplishment Report', category: 'summary' },
  { id: 'population-by-barangay', title: 'Current Recorded Population by Barangay', category: 'population' },
  { id: 'population-by-species', title: 'Current Recorded Population by Species', category: 'population' },
  { id: 'population-by-farm', title: 'Current Recorded Population by Farm', category: 'population' },
  { id: 'population-by-owner', title: 'Current Recorded Population by Owner', category: 'population' },
  { id: 'population-groups', title: 'Population Groups Masterlist', category: 'population' },
  { id: 'population-updates', title: 'Monthly Population Updates', category: 'population' },
  { id: 'population-overdue', title: 'Overdue / Outdated Population Records', category: 'population' },
  { id: 'disease-cases', title: 'Disease Case Monitoring Report', category: 'disease' },
  { id: 'cases-by-status', title: 'Cases by Status', category: 'disease' },
  { id: 'cases-by-disease', title: 'Cases by Suspected Disease', category: 'disease' },
  { id: 'cases-by-barangay', title: 'Cases by Barangay', category: 'disease' },
  { id: 'lab-results', title: 'Laboratory Results', category: 'disease' },
  { id: 'investigations', title: 'Investigation Log', category: 'disease' },
  { id: 'cases-awaiting-geotag', title: 'Cases Awaiting Geotagging', category: 'disease' },
  { id: 'outbreak-area', title: 'Outbreak-Area Report', category: 'outbreak' },
  { id: 'response-activities', title: 'Response Activities Log', category: 'outbreak' },
  { id: 'vaccination-records', title: 'Vaccination Records', category: 'vaccination' },
  { id: 'vaccination-coverage', title: 'Vaccination Coverage by Species', category: 'vaccination' },
  { id: 'vaccination-upcoming', title: 'Upcoming Vaccination Schedule', category: 'vaccination' },
  { id: 'vaccination-by-barangay', title: 'Vaccination Activity by Barangay', category: 'vaccination' },
  { id: 'owner-registry', title: 'Livestock Owner Registry', category: 'ownership' },
  { id: 'farm-registry', title: 'Farm Registry', category: 'ownership' },
  { id: 'animal-registry', title: 'Animal ID / Ear Tag Registry', category: 'ownership' },
  { id: 'ownership-transfers', title: 'Ownership Transfers', category: 'ownership' },
  { id: 'stray-incidents', title: 'Stray Livestock & Violations', category: 'ownership' },
  { id: 'pcic-policies', title: 'PCIC Livestock Insurance Policies', category: 'ownership' },
  { id: 'rsbsa-registration', title: 'RSBSA Registration by Barangay', category: 'ownership' },
  { id: 'incomplete-records', title: 'Incomplete Records', category: 'ownership' },
  { id: 'farms-without-coordinates', title: 'Farms without Coordinates', category: 'ownership' },
];

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export interface ReportResult {
  id: string;
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  summary: { label: string; value: string | number }[];
  note?: string;
}
