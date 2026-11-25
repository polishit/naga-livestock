import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ReportResult, SettingsInput } from '@livestock/shared';
import { useApi } from '@/lib/hooks';
import { exportCsv, exportPdf, exportXlsx, printReport, type Letterhead } from '@/lib/export';

export function useLetterhead(): Letterhead {
  const { data } = useApi<SettingsInput>('/api/settings', { staleTime: 300_000 });
  return {
    line1: data?.letterheadLine1 ?? 'Republic of the Philippines',
    line2: data?.letterheadLine2 ?? 'City Government of Naga',
    office: data?.officeName ?? 'City Veterinary Office',
    city: data?.cityName ?? 'Naga City',
    address: data?.officeAddress ?? null,
    contact: data?.officeContact ?? null,
    email: data?.officeEmail ?? null,
  };
}

export function ExportButtons({
  report,
  size = 'sm',
  print = true,
}: {
  report: ReportResult | undefined | null;
  size?: 'sm' | 'default';
  print?: boolean;
}) {
  const lh = useLetterhead();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (kind: string, fn: () => unknown) => {
    if (!report) return;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast.error('Export failed.');
    } finally {
      setBusy(null);
    }
  };
  // One joined group of buttons, so the downloads read as one control.
  const item = cn(
    'inline-flex items-center gap-1.5 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4',
    size === 'sm' ? 'h-8 text-[13.5px]' : 'h-10 text-[14.5px]',
  );
  return (
    <div className="inline-flex divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
      <button
        type="button"
        className={item}
        disabled={!report}
        onClick={() => run('csv', () => exportCsv(report!))}
      >
        <Download /> CSV
      </button>
      <button
        type="button"
        className={item}
        disabled={!report || busy === 'xlsx'}
        onClick={() => run('xlsx', () => exportXlsx(report!, lh))}
      >
        XLSX
      </button>
      <button
        type="button"
        className={item}
        disabled={!report || busy === 'pdf'}
        onClick={() => run('pdf', () => exportPdf(report!, lh))}
      >
        PDF
      </button>
      {print && (
        <button
          type="button"
          className={item}
          disabled={!report}
          onClick={() => run('print', () => printReport(report!, lh))}
        >
          <Printer /> Print
        </button>
      )}
    </div>
  );
}
