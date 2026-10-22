import { describe, expect, it } from 'vitest';
import { addMonths, isoMonth } from '@livestock/shared';
import { monthlyTrend, recordStatus } from '../src/services/metrics';

const now = isoMonth();

describe('recordStatus', () => {
  it('is verified when every group was updated this month', () => {
    expect(recordStatus([{ lastVerified: now }, { lastVerified: now }])).toBe('verified');
  });
  it('is overdue when the stalest group was last updated last month', () => {
    expect(recordStatus([{ lastVerified: now }, { lastVerified: addMonths(now, -1) }])).toBe('overdue');
  });
  it('is outdated when updates are two or more months old', () => {
    expect(recordStatus([{ lastVerified: addMonths(now, -2) }])).toBe('outdated');
    expect(recordStatus([{ lastVerified: null }])).toBe('outdated');
  });
  it('reports farms without groups', () => {
    expect(recordStatus([])).toBe('no_groups');
  });
});

describe('monthlyTrend', () => {
  const g = (updates: { month: string; count: number; superseded?: boolean }[]) =>
    ({
      updates: updates.map((u, i) => ({ id: i + 1, superseded: false, kind: 'VERIFIED', ...u })),
      count: 0,
      animals: [],
    }) as any;
  const farm = (groups: any[]) => ({ groups }) as any;

  it('splits verified, carried-forward and adjusted values', () => {
    const farms = [
      farm([
        g([
          { month: '2026-08', count: 10 },
          { month: '2026-09', count: 12 },
        ]),
        g([{ month: '2026-08', count: 5 }]),
        g([
          { month: '2026-09', count: 7, superseded: true },
          { month: '2026-09', count: 8 },
        ]),
      ]),
    ];
    const [aug, sep] = monthlyTrend(farms, ['2026-08', '2026-09']);
    expect(aug).toMatchObject({ verified: 15, carried: 0, adjusted: 0 });
    // group 1 verified (12), group 2 carried (5), group 3 amended → adjusted (8)
    expect(sep).toMatchObject({ verified: 12, carried: 5, adjusted: 8, total: 25 });
  });
});
