import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ReportResult, SettingsInput } from '@livestock/shared';
import { useApi } from '@/lib/hooks';
import { exportCsv, exportPdf, exportXlsx, printReport, type Letterhead } from '@/lib/export';
import { Button } from './ui';

export function useLetterhead(): Letterhead {
  const { data } = useApi<SettingsInput>('/api/settings', { staleTime: 300_000 });
  return {
    line1: data?.letterheadLine1 ?? 'Republic of the Philippines',
    line2: data?.letterheadLine2 ?? 'City Government of Naga',
    office: data?.officeName ?? 'City Veterinary Office',
    city: data?.cityName ?? 'Naga City',
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
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size={size}
        disabled={!report}
        onClick={() => run('csv', () => exportCsv(report!))}
      >
        <Download /> CSV
      </Button>
      <Button
        variant="outline"
        size={size}
        disabled={!report}
        loading={busy === 'xlsx'}
        onClick={() => run('xlsx', () => exportXlsx(report!, lh))}
      >
        XLSX
      </Button>
      <Button
        variant="outline"
        size={size}
        disabled={!report}
        loading={busy === 'pdf'}
        onClick={() => run('pdf', () => exportPdf(report!, lh))}
      >
        PDF
      </Button>
      {print && (
        <Button
          variant="outline"
          size={size}
          disabled={!report}
          onClick={() => run('print', () => printReport(report!, lh))}
        >
          <Printer /> Print
        </Button>
      )}
    </div>
  );
}
