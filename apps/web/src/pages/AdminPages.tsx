import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { settingsSchema, type SettingsInput } from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi, useResetOnOpen, useSave } from '@/lib/hooks';
import { err, useZodForm } from '@/components/forms';
import { Loading, PageHeader } from '@/components/page';
import { Button, Card, CardHeader, Field, Input } from '@/components/ui';

/** Download every record as one JSON file (admin). Retries once after refreshing an expired login. */
async function downloadBackup() {
  let res = await fetch('/api/settings/backup', { credentials: 'include' });
  if (res.status === 401) {
    await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    res = await fetch('/api/settings/backup', { credentials: 'include' });
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Backup failed (${res.status})`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'backup.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const [backingUp, setBackingUp] = useState(false);
  const { data, isLoading } = useApi<SettingsInput>('/api/settings');
  const form = useZodForm(settingsSchema, {});
  useResetOnOpen(!!data, form, (data ?? {}) as any);
  const save = useSave<any>('PUT', '/api/settings', { success: 'Settings saved.', form, offline: false });
  const e = form.formState.errors;
  if (isLoading || !data) return <Loading />;
  return (
    <div>
      <PageHeader
        title="System Settings"
        subtitle="Office details used on reports, and thresholds used by monitoring."
        actions={
          isAdmin && (
            <Button
              variant="outline"
              loading={backingUp}
              onClick={async () => {
                setBackingUp(true);
                try {
                  await downloadBackup();
                  toast.success('Backup downloaded. Keep the file somewhere safe.');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Backup failed');
                } finally {
                  setBackingUp(false);
                }
              }}
            >
              <Download /> Download Backup
            </Button>
          )
        }
      />
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <CardHeader title="Office & Letterhead" />
          <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field label="Office Name *" error={err(e, 'officeName')} className="sm:col-span-2">
              <Input {...form.register('officeName')} />
            </Field>
            <Field label="City *" error={err(e, 'cityName')}>
              <Input {...form.register('cityName')} />
            </Field>
            <div />
            <Field label="Letterhead Line 1" error={err(e, 'letterheadLine1')}>
              <Input {...form.register('letterheadLine1')} />
            </Field>
            <Field label="Letterhead Line 2" error={err(e, 'letterheadLine2')}>
              <Input {...form.register('letterheadLine2')} />
            </Field>
            <Field
              label="Office Address"
              error={err(e, 'officeAddress')}
              hint="Printed as “Submitted by” on the laboratory forms"
              className="sm:col-span-2"
            >
              <Input
                {...form.register('officeAddress')}
                placeholder="Del Rosario, Naga City, Camarines Sur"
              />
            </Field>
            <Field label="Office contact no." error={err(e, 'officeContact')}>
              <Input {...form.register('officeContact')} />
            </Field>
            <Field label="Office Email" error={err(e, 'officeEmail')}>
              <Input type="email" {...form.register('officeEmail')} />
            </Field>
          </fieldset>
        </Card>
        <Card>
          <CardHeader title="Monitoring Thresholds" />
          <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field label="Default Assessment Radius (m)" error={err(e, 'defaultRadiusMeters')}>
              <Input type="number" min={50} {...form.register('defaultRadiusMeters')} />
            </Field>
            <Field label="Upcoming Vaccination Window (Days)" error={err(e, 'vaccinationUpcomingDays')}>
              <Input type="number" min={1} {...form.register('vaccinationUpcomingDays')} />
            </Field>
            <Field label="Population Update Due After (Days)" error={err(e, 'populationOverdueDays')}>
              <Input type="number" min={1} {...form.register('populationOverdueDays')} />
            </Field>
          </fieldset>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Sign-In Security" />
          <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
            <Field
              label="Wrong Passwords Before Lock"
              error={err(e, 'lockoutAttempts')}
              hint="An account locks itself after this many wrong passwords in a row"
            >
              <Input type="number" min={3} max={20} {...form.register('lockoutAttempts')} />
            </Field>
            <Field
              label="Lock Lasts (Minutes)"
              error={err(e, 'lockoutMinutes')}
              hint="The administrator can unlock it sooner"
            >
              <Input type="number" min={1} {...form.register('lockoutMinutes')} />
            </Field>
            <Field
              label="Sign Out When Idle for (Minutes)"
              error={err(e, 'idleTimeoutMinutes')}
              hint="No tap, key press or scroll for this long"
            >
              <Input type="number" min={5} {...form.register('idleTimeoutMinutes')} />
            </Field>
          </fieldset>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Owner App Review Rules" />
          <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
            <Field
              label="Flag a head count change above (%)"
              error={err(e, 'popFlagPercent')}
              hint="An owner's change larger than this share of the recorded count waits for a reviewer…"
            >
              <Input type="number" min={1} {...form.register('popFlagPercent')} />
            </Field>
            <Field
              label="…and at least (head)"
              error={err(e, 'popFlagMinHeads')}
              hint="Smaller changes are always accepted automatically"
            >
              <Input type="number" min={1} {...form.register('popFlagMinHeads')} />
            </Field>
            <Field
              label="Review Within (Days)"
              error={err(e, 'reviewDays')}
              hint="Registrations and reports waiting longer are marked in red"
            >
              <Input type="number" min={1} {...form.register('reviewDays')} />
            </Field>
          </fieldset>
        </Card>
        {isAdmin ? (
          <div className="flex justify-end lg:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save Settings
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500 lg:col-span-2">
            Only the System Administrator can change settings.
          </p>
        )}
      </form>
    </div>
  );
}
