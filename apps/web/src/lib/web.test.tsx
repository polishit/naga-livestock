import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReportResult } from '@livestock/shared';
import { DataTable } from '@/components/DataTable';
import { toCsv } from './export';
import { db, enqueue, pendingCount } from './offline';
import { qs } from './utils';

describe('qs', () => {
  it('omits empty and "all" values', () => {
    expect(qs({ a: 'x', b: '', c: undefined, d: 'all', e: 3 })).toBe('?a=x&e=3');
    expect(qs({})).toBe('');
  });
});

describe('toCsv', () => {
  it('escapes values and appends the summary', () => {
    const r: ReportResult = {
      id: 'x',
      title: 'T',
      subtitle: 'S',
      columns: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      rows: [{ a: 'Lakeside, Poultry', b: 'say "hi"' }],
      summary: [{ label: 'Total', value: 1 }],
    };
    const csv = toCsv(r);
    expect(csv).toContain('"Lakeside, Poultry","say ""hi"""');
    expect(csv).toContain('Total,1');
  });
});

describe('offline outbox', () => {
  it('queues writes in IndexedDB', async () => {
    await db.outbox.clear();
    await enqueue({ method: 'POST', url: '/api/owners', body: { fullName: 'A' }, label: 'Register owner A' });
    expect(await pendingCount()).toBe(1);
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 1, name: 'Bravo', n: 2 },
    { id: 2, name: 'Alpha', n: 10 },
    { id: 3, name: 'Charlie', n: 1 },
  ];
  it('searches and sorts', () => {
    const { container } = render(
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        searchText={(r) => r.name}
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'n', header: 'N' },
        ]}
      />,
    );
    const table = container.querySelector('table')!;
    fireEvent.click(screen.getAllByRole('button', { name: /N/ }).find((b) => b.textContent === 'N')!);
    const firstCells = () =>
      [...table.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent);
    expect(firstCells()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    fireEvent.change(screen.getByLabelText('Search table'), { target: { value: 'alp' } });
    expect(firstCells()).toEqual(['Alpha']);
  });
});
