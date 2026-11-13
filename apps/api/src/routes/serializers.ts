import {
  CASE_CLASS_LABELS,
  CASE_STATUS_LABELS,
  PD_RESULT_LABELS,
  caseClass,
  type PdResult,
  SERVICE_TYPE_LABELS,
  type ServiceType,
  VISIT_FINDING_LABELS,
  VISIT_PURPOSE_LABELS,
  type VisitFinding,
  type VisitPurpose,
} from '@livestock/shared';
import { ymd } from '../lib/dates';

export function serializeCase(c: any) {
  // The office's own classification (Reported → Suspected → Active → Closed).
  const classification = caseClass({
    status: c.status,
    closed: c.closedAt != null,
    visited: c.visited ?? (c._count?.investigations ?? 0) > 0,
  });
  return {
    id: c.id,
    code: c.code,
    disease: c.disease,
    species: c.species,
    status: c.status,
    statusLabel: CASE_STATUS_LABELS[c.status as keyof typeof CASE_STATUS_LABELS],
    classification,
    classLabel: CASE_CLASS_LABELS[classification],
    reportedAt: ymd(c.reportedAt),
    symptomsDate: ymd(c.symptomsDate),
    barangay: c.barangay,
    zone: c.zone,
    affected: c.affected,
    deaths: c.deaths,
    lat: c.lat,
    lng: c.lng,
    mapped: c.lat != null && c.lng != null,
    locationSource: c.locationSource,
    ownerId: c.ownerId,
    ownerName: c.owner?.fullName ?? null,
    farmId: c.farmId,
    farmName: c.farm?.name ?? null,
    reportedBy: c.reportedBy,
    assignedToId: c.assignedToId,
    assignedToName: c.assignedTo?.name ?? null,
    symptoms: c.symptoms,
    clinicalSigns: (c.clinicalSigns as string[] | null) ?? [],
    sampleInfo: c.sampleInfo,
    remarks: c.remarks,
    photoKeys: (c.photoKeys as string[] | null) ?? [],
    closed: c.closedAt != null,
    closedAt: c.closedAt ?? null,
    closedBy: c.closedBy ?? null,
    closureNote: c.closureNote ?? null,
    closureOutcome: c.closureOutcome ?? null,
    relatedCaseId: c.relatedCaseId ?? null,
    relatedCaseCode: c.relatedCase?.code ?? null,
    voided: c.voidedAt != null,
    voidedBy: c.voidedBy ?? null,
    voidReason: c.voidReason ?? null,
  };
}

export function serializeVaccination(v: any) {
  const target = v.target === 'GROUP' ? `${v.species} · ${v.count} head` : `Animal ${v.animal?.code ?? '—'}`;
  return {
    id: v.id,
    code: v.code,
    date: ymd(v.date),
    nextDate: ymd(v.nextDate),
    serviceType: v.serviceType,
    serviceLabel: SERVICE_TYPE_LABELS[v.serviceType as ServiceType] ?? v.serviceType,
    vaccine: v.vaccine,
    result: v.result ?? null,
    resultLabel: v.result ? (PD_RESULT_LABELS[v.result as PdResult] ?? v.result) : null,
    species: v.species,
    target: v.target,
    targetLabel: target,
    groupId: v.groupId,
    animalId: v.animalId,
    count: v.count,
    doseNumber: v.doseNumber,
    batch: v.batch,
    administeredBy: v.administeredBy,
    remarks: v.remarks,
    farmId: v.farmId,
    farmName: v.farm?.name ?? null,
    barangay: v.farm?.barangay ?? null,
    reminderDone: !!v.reminderDone,
    voided: v.voidedAt != null,
    voidedBy: v.voidedBy ?? null,
    voidReason: v.voidReason ?? null,
  };
}

export function serializeTransfer(t: any, farmNames: Map<number, string>) {
  return {
    id: t.id,
    code: t.code,
    date: ymd(t.date),
    animalId: t.animalId,
    animalCode: t.animal?.code ?? null,
    earTag: t.animal?.earTag ?? null,
    fromOwnerId: t.fromOwnerId,
    fromOwnerName: t.fromOwner?.fullName ?? null,
    fromFarmId: t.fromFarmId,
    fromFarmName: farmNames.get(t.fromFarmId) ?? null,
    toOwnerId: t.toOwnerId,
    toOwnerName: t.toOwner?.fullName ?? null,
    toFarmId: t.toFarmId,
    toFarmName: farmNames.get(t.toFarmId) ?? null,
    type: t.type,
    remarks: t.remarks,
  };
}

export function serializeVisit(v: any) {
  return {
    id: v.id,
    code: v.code,
    date: ymd(v.date),
    farmId: v.farmId,
    farmName: v.farm?.name ?? null,
    barangay: v.farm?.barangay ?? null,
    caseId: v.caseId ?? null,
    caseCode: v.case?.code ?? null,
    caseDisease: v.case?.disease ?? null,
    purpose: v.purpose,
    purposeLabel: VISIT_PURPOSE_LABELS[v.purpose as VisitPurpose] ?? v.purpose,
    findings: v.findings,
    findingsLabel: VISIT_FINDING_LABELS[v.findings as VisitFinding] ?? v.findings,
    visitedBy: v.visitedBy,
    remarks: v.remarks,
  };
}
