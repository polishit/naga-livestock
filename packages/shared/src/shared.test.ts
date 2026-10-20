import { describe, expect, it } from 'vitest';
import {
  addMonths,
  caseCreateSchema,
  caseMarkerKind,
  code,
  distanceMeters,
  farmCreateSchema,
  fmtDate,
  fmtMonth,
  lastMonths,
  ownerCreateSchema,
  roundDistance,
  vaccinationCreateSchema,
} from './index';

describe('format helpers', () => {
  it('pads codes', () => {
    expect(code('OWN', 1)).toBe('OWN-0001');
    expect(code('CASE', 12)).toBe('CASE-0012');
  });
  it('formats dates and months', () => {
    expect(fmtDate('2026-08-31')).toBe('Aug 31, 2026');
    expect(fmtMonth('2026-10')).toBe('Oct 2026');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(lastMonths(6, '2026-10')).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });
});

describe('geo', () => {
  it('matches the radius-analysis distances from the prototype', () => {
    // Ground Zero Piggery → Cararayan Hog Farm is shown as 210 m.
    expect(roundDistance(distanceMeters(13.638, 123.238, 13.639775, 123.238665))).toBe(210);
    // → Sunrise Livestock is shown as 910 m.
    expect(roundDistance(distanceMeters(13.638, 123.238, 13.642092, 123.230707))).toBe(910);
  });
});

describe('schemas', () => {
  it('validates owner registration', () => {
    expect(ownerCreateSchema.safeParse({ fullName: '', barangay: 'Pacol' }).success).toBe(false);
    const ok = ownerCreateSchema.parse({ fullName: ' Juan ', barangay: 'Pacol', zone: '' });
    expect(ok.fullName).toBe('Juan');
    expect(ok.zone).toBeUndefined();
  });
  it('coerces farm coordinates and allows blanks', () => {
    const f = farmCreateSchema.parse({
      ownerId: '3',
      name: 'X',
      type: 'backyard',
      barangay: 'Pacol',
      lat: '',
      lng: '',
    });
    expect(f.ownerId).toBe(3);
    expect(f.lat).toBeUndefined();
  });
  it('rejects deaths greater than affected', () => {
    const r = caseCreateSchema.safeParse({
      ownerId: 1,
      farmId: 1,
      species: 'Swine',
      disease: 'ASF',
      affected: 1,
      deaths: 2,
    });
    expect(r.success).toBe(false);
  });
  it('requires a group for group vaccinations', () => {
    const r = vaccinationCreateSchema.safeParse({
      farmId: 1,
      target: 'GROUP',
      count: 3,
      vaccine: 'NCD',
      doseNumber: 1,
    });
    expect(r.success).toBe(false);
  });
  it('maps case statuses to marker kinds', () => {
    expect(caseMarkerKind('AWAITING_RESULT')).toBe('lab');
    expect(caseMarkerKind('SAMPLE_COLLECTED')).toBe('suspected');
  });
});
