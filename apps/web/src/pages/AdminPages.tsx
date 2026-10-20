import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { ROLE_LABELS, fmtDateTime, settingsSchema, type Role, type SettingsInput } from '@livestock/shared';
import { useAuth } from '@/lib/auth';
import { useApi, useResetOnOpen, useSave } from '@/lib/hooks';
import { DataTable } from '@/components/DataTable';
import { err, useZodForm } from '@/components/forms';
import { ErrorBox, Loading, PageHeader } from '@/components/page';
import { Badge, Button, Card, CardHeader, Field, Input } from '@/components/ui';
import { UserDialog, type UserRecord } from '@/dialogs/surveillance';

export function UsersPage() {
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<UserRecord | undefined>();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useApi<(UserRecord & { lastLoginAt: string | null })[]>('/api/users');
  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Accounts and roles. Administrators manage users; staff record data; read-only users can view and export."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            <Plus /> Add user
          </Button>
        }
      />
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={data}
            loading={isLoading}
            rowKey={(r) => r.id}
            searchText={(r) => `${r.name} ${r.email} ${r.role}`}
            pageSize={0}
            columns={[
              {
                key: 'name',
                header: 'Name',
                cell: (r) => (
                  <span className="font-medium text-slate-900">
                    {r.name}
                    {r.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                  </span>
                ),
              },
              { key: 'email', header: 'Email' },
              { key: 'title', header: 'Title' },
              {
                key: 'role',
                header: 'Role',
                cell: (r) => (
                  <Badge tone={r.role === 'ADMIN' ? 'violet' : r.role === 'STAFF' ? 'green' : 'slate'}>
                    {ROLE_LABELS[r.role as Role]}
                  </Badge>
                ),
              },
              {
                key: 'active',
                header: 'Status',
                cell: (r) => (r.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>),
              },
              {
                key: 'lastLoginAt',
                header: 'Last sign-in',
                cell: (r) => (r.lastLoginAt ? fmtDateTime(r.lastLoginAt) : 'Never'),
              },
              {
                key: 'actions',
                header: '',
                sort: false,
                cell: (r) => (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                  >
                    <Pencil /> Edit
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}
      <UserDialog open={open} onOpenChange={setOpen} user={editing} />
    </div>
  );
}

export function SettingsPage() {
  const { isAdmin } = useAuth();
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
      />
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <CardHeader title="Office & letterhead" />
          <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field label="Office name *" error={err(e, 'officeName')} className="sm:col-span-2">
              <Input {...form.register('officeName')} />
            </Field>
            <Field label="City *" error={err(e, 'cityName')}>
              <Input {...form.register('cityName')} />
            </Field>
            <div />
            <Field label="Letterhead line 1" error={err(e, 'letterheadLine1')}>
              <Input {...form.register('letterheadLine1')} />
            </Field>
            <Field label="Letterhead line 2" error={err(e, 'letterheadLine2')}>
              <Input {...form.register('letterheadLine2')} />
            </Field>
          </fieldset>
        </Card>
        <Card>
          <CardHeader title="Monitoring thresholds" />
          <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field label="Default assessment radius (m)" error={err(e, 'defaultRadiusMeters')}>
              <Input type="number" min={50} {...form.register('defaultRadiusMeters')} />
            </Field>
            <Field label="Upcoming vaccination window (days)" error={err(e, 'vaccinationUpcomingDays')}>
              <Input type="number" min={1} {...form.register('vaccinationUpcomingDays')} />
            </Field>
            <Field label="Population update due after (days)" error={err(e, 'populationOverdueDays')}>
              <Input type="number" min={1} {...form.register('populationOverdueDays')} />
            </Field>
          </fieldset>
        </Card>
        {isAdmin ? (
          <div className="flex justify-end lg:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save settings
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500 lg:col-span-2">Only administrators can change settings.</p>
        )}
      </form>
    </div>
  );
}
