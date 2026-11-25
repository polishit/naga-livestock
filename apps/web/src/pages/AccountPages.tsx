import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockOpen,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserMinus,
  UserX,
} from 'lucide-react';
import { forwardRef, useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  PASSWORD_RULE,
  ROLE_HELP,
  ROLE_LABELS,
  STAFF_ROLES,
  USER_STATUS_LABELS,
  changePasswordSchema,
  fmtDateTime,
  userCreateSchema,
  userReassignSchema,
  userUpdateSchema,
  type Role,
  type StaffRole,
  type UserStatus,
} from '@livestock/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth, type User } from '@/lib/auth';
import { useApi, useResetOnOpen, useSave } from '@/lib/hooks';
import { qs } from '@/lib/utils';
import { DataTable } from '@/components/DataTable';
import { MoreMenu } from '@/components/MoreMenu';
import { err, useZodForm } from '@/components/forms';
import { ErrorBox, FilterField, MoreFilters, PageHeader } from '@/components/page';
import { Badge, Button, Card, Dialog, Field, Input, Select, type Tone } from '@/components/ui';

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export interface StaffAccount {
  id: number;
  name: string;
  email: string;
  title: string | null;
  role: StaffRole;
  status: UserStatus;
  mustChangePassword: boolean;
  locked: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  openCases: number;
}

const ROLE_TONE: Record<StaffRole, Tone> = { ADMIN: 'violet', VETERINARIAN: 'green', TECHNICIAN: 'blue' };
const STATUS_TONE: Record<UserStatus, Tone> = { ACTIVE: 'green', SUSPENDED: 'amber', DEACTIVATED: 'slate' };

/* ---------------- password field with show/hide ---------------- */

const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput(props, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Input {...props} ref={ref} type={show ? 'text' : 'password'} className="pr-11" />
        <button
          type="button"
          onClick={() => setShow((x) => !x)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);

/** The change-password form, used in the dialog and on the first sign-in screen. */
function ChangePasswordForm({
  id,
  temporary,
  onDone,
  onBusy,
}: {
  id: string;
  temporary?: boolean;
  onDone: () => void;
  onBusy?: (b: boolean) => void;
}) {
  const { setUser } = useAuth();
  const form = useZodForm(changePasswordSchema, { current: '', password: '', confirm: '' });
  const e = form.formState.errors;
  const save = useMutation({
    mutationFn: (v: unknown) => api.post<{ user: User }>('/api/auth/change-password', v),
    onMutate: () => onBusy?.(true),
    onSettled: () => onBusy?.(false),
    onSuccess: (r) => {
      setUser(r.user);
      toast.success('Password changed.');
      form.reset();
      onDone();
    },
    onError: (x: unknown) => {
      if (x instanceof ApiError && x.fieldErrors)
        for (const [f, m] of Object.entries(x.fieldErrors))
          form.setError(f, { type: 'server', message: m[0] });
      else toast.error(x instanceof Error ? x.message : 'Could not change the password. Try again.');
    },
  });
  return (
    <form id={id} noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
      <Field label={temporary ? 'Temporary password *' : 'Current password *'} error={err(e, 'current')}>
        <PasswordInput autoComplete="current-password" {...form.register('current')} />
      </Field>
      <Field label="New Password *" error={err(e, 'password')} hint={PASSWORD_RULE}>
        <PasswordInput autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Field label="Type the New Password Again *" error={err(e, 'confirm')}>
        <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
      </Field>
    </form>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: DialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change Password"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="change-password" type="submit" loading={busy}>
            Change Password
          </Button>
        </>
      }
    >
      <ChangePasswordForm id="change-password" onDone={() => onOpenChange(false)} onBusy={setBusy} />
    </Dialog>
  );
}

/**
 * First sign-in with a temporary password: nothing else can be opened until the user sets a
 * password of their own.
 */
export function FirstPasswordScreen() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-brand-dark">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="mt-3 text-[22px] font-semibold text-slate-900">Set Your Own Password</h1>
        <p className="mt-1 text-[15px] text-slate-600">
          {user?.name}, you signed in with a temporary password. Choose a new one that only you know to
          continue.
        </p>
        <div className="mt-5">
          <ChangePasswordForm id="first-password" temporary onDone={() => undefined} onBusy={setBusy} />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => void logout()}>
            Sign Out
          </Button>
          <Button form="first-password" type="submit" loading={busy}>
            Save and Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- user management ---------------- */

/** A temporary password, shown once so the administrator can hand it over. */
function TemporaryPasswordDialog({
  shown,
  onClose,
}: {
  shown: { name: string; email: string; password: string; reset?: boolean } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!shown}
      onOpenChange={(o) => !o && onClose()}
      title={shown?.reset ? 'Password reset' : 'Account created'}
      size="sm"
      guardChanges={false}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {shown && (
        <div className="space-y-3 text-[15px] text-slate-700">
          <p>
            Give this temporary password to <b>{shown.name}</b> ({shown.email}). They will be asked to change
            it the first time they sign in.
          </p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <code className="select-all text-[18px] font-semibold tracking-wide text-slate-900">
              {shown.password}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(shown.password)
                  .then(() => toast.success('Copied.'))
                  .catch(() => toast.error('Could not copy. Write it down instead.'))
              }
            >
              <Copy /> Copy
            </Button>
          </div>
          <p className="text-[13px] text-slate-500">
            This is shown only once. If it is lost, use “Reset password” to make a new one.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  account,
  onCreated,
}: DialogProps & {
  account?: StaffAccount;
  onCreated: (r: StaffAccount & { temporaryPassword: string }) => void;
}) {
  const editing = !!account;
  const { user: me } = useAuth();
  const form = useZodForm(editing ? userUpdateSchema : userCreateSchema, {});
  useResetOnOpen(open, form, {
    name: account?.name ?? '',
    email: account?.email ?? '',
    role: account?.role ?? 'TECHNICIAN',
    title: account?.title ?? '',
  });
  const save = useSave<any, StaffAccount & { temporaryPassword?: string }>(
    editing ? 'PATCH' : 'POST',
    editing ? `/api/users/${account!.id}` : '/api/users',
    {
      success: editing ? 'Account updated.' : '',
      form,
      offline: false,
      onDone: (r) => {
        onOpenChange(false);
        if (!editing && 'temporaryPassword' in r && r.temporaryPassword)
          onCreated(r as StaffAccount & { temporaryPassword: string });
      },
    },
  );
  const e = form.formState.errors;
  const role = form.watch('role') as StaffRole;
  const self = editing && account!.id === me?.id;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${account!.name}` : 'Add staff account'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button form="account-form" type="submit" loading={save.isPending}>
            {editing ? 'Save Changes' : 'Create Account'}
          </Button>
        </>
      }
    >
      <form
        id="account-form"
        noValidate
        onSubmit={form.handleSubmit((v) =>
          save.mutate(editing ? { name: v.name, role: v.role, title: v.title } : v),
        )}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Full Name *" error={err(e, 'name')}>
          <Input {...form.register('name')} />
        </Field>
        <Field
          label="Email *"
          error={err(e, 'email')}
          hint={editing ? 'The email cannot be changed' : undefined}
        >
          <Input type="email" {...form.register('email')} disabled={editing} />
        </Field>
        <Field
          label="Role *"
          error={err(e, 'role')}
          hint={self ? 'You cannot change your own role' : ROLE_HELP[role]}
          className="sm:col-span-2"
        >
          <Select {...form.register('role')} disabled={self}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Position Title" error={err(e, 'title')} className="sm:col-span-2">
          <Input {...form.register('title')} placeholder="Veterinary Inspector" />
        </Field>
        {!editing && (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 sm:col-span-2">
            The system makes a temporary password and shows it to you once. The staff member must change it at
            the first sign-in.
          </p>
        )}
        {editing && (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600 sm:col-span-2">
            A new role signs the person out. The new permissions apply the next time they sign in, and the
            change is written to the audit log.
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** Hand the open cases of one staff member to another (asked for before deactivating). */
function ReassignDialog({
  account,
  others,
  thenDeactivate,
  onClose,
}: {
  account: StaffAccount | null;
  others: StaffAccount[];
  thenDeactivate: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const form = useZodForm(userReassignSchema, {});
  useResetOnOpen(!!account, form, { toUserId: '' });
  const e = form.formState.errors;
  const run = useMutation({
    mutationFn: async (v: { toUserId: number }) => {
      const r = await api.post<{ reassigned: number }>(`/api/users/${account!.id}/reassign`, v);
      if (thenDeactivate) await api.patch(`/api/users/${account!.id}`, { status: 'DEACTIVATED' });
      return r;
    },
    onSuccess: (r) => {
      toast.success(
        `${r.reassigned} open case(s) reassigned.${thenDeactivate ? ` ${account!.name} was deactivated.` : ''}`,
      );
      qc.invalidateQueries();
      onClose();
    },
    onError: (x: unknown) => {
      if (x instanceof ApiError && x.fieldErrors?.toUserId)
        form.setError('toUserId', { type: 'server', message: x.fieldErrors.toUserId[0] });
      else toast.error(x instanceof Error ? x.message : 'Could not reassign. Try again.');
    },
  });
  return (
    <Dialog
      open={!!account}
      onOpenChange={(o) => !o && onClose()}
      title={thenDeactivate ? `Reassign cases, then deactivate` : 'Reassign open cases'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="reassign-form" type="submit" loading={run.isPending}>
            {thenDeactivate ? 'Reassign and Deactivate' : 'Reassign'}
          </Button>
        </>
      }
    >
      {account && (
        <form
          id="reassign-form"
          noValidate
          onSubmit={form.handleSubmit((v) => run.mutate(v as { toUserId: number }))}
          className="space-y-4"
        >
          <p className="text-[15px] text-slate-700">
            <b>{account.name}</b> is assigned to <b>{account.openCases}</b> open disease case
            {account.openCases === 1 ? '' : 's'}. Open work cannot stay with an account that can no longer
            sign in, so choose who takes over.
          </p>
          <Field label="Reassign To *" error={err(e, 'toUserId')}>
            <Select {...form.register('toUserId')}>
              <option value="">Select a staff member…</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {ROLE_LABELS[o.role]}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      )}
    </Dialog>
  );
}

/** One confirmation dialog for suspend, deactivate, reactivate, reset password and unlock. */
function ConfirmDialog({
  ask,
  onClose,
}: {
  ask: null | { title: string; body: ReactNode; confirm: string; danger?: boolean; run: () => Promise<void> };
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={!!ask}
      onOpenChange={(o) => !o && onClose()}
      title={ask?.title ?? ''}
      size="sm"
      guardChanges={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={ask?.danger ? 'destructive' : 'default'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await ask!.run();
                onClose();
              } catch (x) {
                toast.error(x instanceof Error ? x.message : 'Something went wrong. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {ask?.confirm}
          </Button>
        </>
      }
    >
      <div className="text-[15px] text-slate-700">{ask?.body}</div>
    </Dialog>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<StaffAccount | undefined>();
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<null | { name: string; email: string; password: string; reset?: boolean }>(
    null,
  );
  const [reassign, setReassign] = useState<null | { account: StaffAccount; deactivate: boolean }>(null);
  const [ask, setAsk] = useState<Parameters<typeof ConfirmDialog>[0]['ask']>(null);
  const { data, isLoading, error } = useApi<StaffAccount[]>('/api/users');
  const active = useMemo(() => (data ?? []).filter((u) => u.status === 'ACTIVE'), [data]);

  const setStatus = async (u: StaffAccount, status: UserStatus, done: string) => {
    await api.patch(`/api/users/${u.id}`, { status });
    toast.success(done);
    await qc.invalidateQueries();
  };

  const actions = (u: StaffAccount) => {
    const self = u.id === me?.id;
    return [
      { label: 'Edit Name, Role or Title', icon: Pencil, onSelect: () => (setEditing(u), setOpen(true)) },
      {
        label: 'Reset Password',
        icon: KeyRound,
        hint: 'Forgotten password: gives a new temporary one',
        onSelect: () =>
          setAsk({
            title: `Reset the password of ${u.name}?`,
            body: (
              <>
                The current password stops working and {u.name} is signed out everywhere. You will get a
                temporary password to hand over; it must be changed at the next sign-in.
              </>
            ),
            confirm: 'Reset Password',
            run: async () => {
              const r = await api.post<{ temporaryPassword: string }>(`/api/users/${u.id}/reset-password`);
              await qc.invalidateQueries();
              setTemp({ name: u.name, email: u.email, password: r.temporaryPassword, reset: true });
            },
          }),
      },
      u.locked && {
        label: 'Unlock Account',
        icon: LockOpen,
        hint: 'Locked after too many wrong passwords',
        onSelect: () =>
          setAsk({
            title: `Unlock ${u.name}?`,
            body: <>The account can sign in again right away with its current password.</>,
            confirm: 'Unlock',
            run: async () => {
              await api.post(`/api/users/${u.id}/unlock`);
              toast.success('Account unlocked.');
              await qc.invalidateQueries();
            },
          }),
      },
      u.openCases > 0 && {
        label: 'Reassign Open Cases',
        icon: UserCheck,
        hint: `${u.openCases} open case${u.openCases === 1 ? '' : 's'} assigned`,
        onSelect: () => setReassign({ account: u, deactivate: false }),
      },
      !self &&
        u.status === 'ACTIVE' && {
          label: 'Suspend',
          icon: UserMinus,
          hint: 'Temporary: cannot sign in until made active again',
          onSelect: () =>
            setAsk({
              title: `Suspend ${u.name}?`,
              body: (
                <>
                  {u.name} is signed out and cannot sign in until you make the account active again. Nothing
                  they recorded is changed.
                </>
              ),
              confirm: 'Suspend',
              danger: true,
              run: () => setStatus(u, 'SUSPENDED', `${u.name} was suspended.`),
            }),
        },
      !self &&
        u.status !== 'DEACTIVATED' && {
          label: 'Deactivate',
          icon: UserX,
          danger: true,
          hint: 'Resigned or transferred. The account is kept, never deleted',
          onSelect: () =>
            u.openCases > 0
              ? setReassign({ account: u, deactivate: true })
              : setAsk({
                  title: `Deactivate ${u.name}?`,
                  body: (
                    <>
                      Use this when a staff member resigns or is transferred. They can no longer sign in, but
                      the account is <b>kept</b>: every record they created or approved stays under their
                      name.
                    </>
                  ),
                  confirm: 'Deactivate',
                  danger: true,
                  run: () => setStatus(u, 'DEACTIVATED', `${u.name} was deactivated.`),
                }),
        },
      u.status !== 'ACTIVE' && {
        label: 'Make Active Again',
        icon: UserCheck,
        onSelect: () =>
          setAsk({
            title: `Make ${u.name} active again?`,
            body: <>The account can sign in again with its current password and role.</>,
            confirm: 'Make Active',
            run: () => setStatus(u, 'ACTIVE', `${u.name} is active again.`),
          }),
      },
    ];
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Staff accounts and roles. Accounts are never deleted: they are suspended or deactivated, so every record keeps its author."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            <Plus /> Add Staff Account
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {STAFF_ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <Badge tone={ROLE_TONE[r]}>{ROLE_LABELS[r]}</Badge>
            <p className="mt-1.5 text-[13px] leading-snug text-slate-600">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>
      {error ? (
        <ErrorBox error={error} />
      ) : (
        <Card>
          <DataTable
            rows={data}
            loading={isLoading}
            rowKey={(r) => r.id}
            searchText={(r) => `${r.name} ${r.email} ${ROLE_LABELS[r.role]} ${USER_STATUS_LABELS[r.status]}`}
            searchPlaceholder="Search name, email or role"
            pageSize={0}
            mobileTitle="name"
            columns={[
              {
                key: 'name',
                header: 'Name',
                cell: (r) => (
                  <div>
                    <div className="font-medium text-slate-900">
                      {r.name}
                      {r.id === me?.id && (
                        <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>
                      )}
                    </div>
                    <div className="text-[13px] text-slate-500">{r.email}</div>
                  </div>
                ),
              },
              { key: 'title', header: 'Position', cell: (r) => r.title ?? '—' },
              {
                key: 'role',
                header: 'Role',
                cell: (r) => <Badge tone={ROLE_TONE[r.role]}>{ROLE_LABELS[r.role]}</Badge>,
              },
              {
                key: 'status',
                header: 'Status',
                cell: (r) => (
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={STATUS_TONE[r.status]}>{USER_STATUS_LABELS[r.status]}</Badge>
                    {r.locked && <Badge tone="red">Locked</Badge>}
                    {r.mustChangePassword && r.status === 'ACTIVE' && (
                      <Badge tone="amber">Temporary Password</Badge>
                    )}
                  </div>
                ),
              },
              {
                key: 'openCases',
                header: 'Open cases',
                cell: (r) => (r.openCases ? r.openCases : '—'),
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
                cell: (r) => <MoreMenu size="xs" items={actions(r)} />,
              },
            ]}
          />
        </Card>
      )}
      <AccountDialog
        open={open}
        onOpenChange={setOpen}
        account={editing}
        onCreated={(r) => setTemp({ name: r.name, email: r.email, password: r.temporaryPassword })}
      />
      <TemporaryPasswordDialog shown={temp} onClose={() => setTemp(null)} />
      <ReassignDialog
        account={reassign?.account ?? null}
        thenDeactivate={!!reassign?.deactivate}
        others={active.filter((u) => u.id !== reassign?.account.id)}
        onClose={() => setReassign(null)}
      />
      <ConfirmDialog ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

/* ---------------- audit log ---------------- */

interface AuditRow {
  id: number;
  tableName: string;
  recordId: string;
  action: string;
  changes: Record<string, unknown> | null;
  note: string | null;
  userId: number | null;
  byName: string | null;
  source: string;
  createdAt: string;
}
interface AuditPage {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditRow[];
  tables: string[];
  users: { id: number; name: string | null }[];
  databaseLock: 'on' | 'off' | 'unknown';
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Changed',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  LOGIN_FAILED: 'Sign-in failed',
  LOCKED: 'Account locked',
  UNLOCKED: 'Account unlocked',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET: 'Password reset',
  EXPORT: 'Exported',
};
const ACTION_TONE: Record<string, Tone> = {
  CREATE: 'green',
  UPDATE: 'blue',
  LOGIN_FAILED: 'orange',
  LOCKED: 'red',
  PASSWORD_RESET: 'violet',
  EXPORT: 'amber',
};
const SOURCE_LABELS: Record<string, string> = { web: 'CVO system', owner: 'Owner app', system: 'Automatic' };

/** camelCase or PascalCase to words: "assignedToId" → "Assigned to id". */
const words = (s: string) => {
  const t = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** The old and new value of each changed field (or the starting values of a new record). */
export function AuditChanges({ row }: { row: Pick<AuditRow, 'action' | 'changes' | 'note'> }) {
  const entries = Object.entries(row.changes ?? {});
  if (!entries.length) return <span className="text-slate-600">{row.note ?? '—'}</span>;
  const isUpdate = row.action === 'UPDATE';
  return (
    <div className="space-y-1">
      {row.note && <div className="text-slate-600">{row.note}</div>}
      <dl className="space-y-0.5 text-[13px]">
        {entries.slice(0, isUpdate ? 30 : 8).map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-1.5">
            <dt className="font-medium text-slate-700">{words(k)}:</dt>
            {isUpdate && Array.isArray(v) ? (
              <dd className="min-w-0 break-words">
                <span className="text-red-700 line-through decoration-red-300">{show(v[0])}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="text-emerald-700">{show(v[1])}</span>
              </dd>
            ) : (
              <dd className="min-w-0 break-words text-slate-600">{show(v)}</dd>
            )}
          </div>
        ))}
        {!isUpdate && entries.length > 8 && (
          <div className="text-slate-400">and {entries.length - 8} more field(s)</div>
        )}
      </dl>
    </div>
  );
}

export function AuditLogPage() {
  const [table, setTable] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [table, action, userId, from, to, q]);
  const { data, isLoading, error, isFetching } = useApi<AuditPage>(
    `/api/audit${qs({ table, action, userId, from, to, q, page: String(page) })}`,
    { placeholderData: (prev) => prev },
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Every record created or changed, every sign-in and every export: who did it, when, and the old and new values."
      />
      <div
        className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-[14px] ${
          data?.databaseLock === 'off'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        {data?.databaseLock === 'off' ? (
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div>
          <b>This log cannot be edited or deleted</b>, not even by the System Administrator. The system has no
          button for it
          {data?.databaseLock === 'off'
            ? '. The extra lock inside the database is off: the database login is not allowed to create it. Ask the database administrator to allow triggers.'
            : ', and the database itself refuses any change to a log entry.'}
        </div>
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 p-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, note or record number"
            aria-label="Search"
            className="w-full sm:w-80"
          />
          <Select
            aria-label="Record type"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            className="w-[calc(50%-4px)] sm:w-52"
          >
            <option value="">All record types</option>
            {(data?.tables ?? []).map((t) => (
              <option key={t} value={t}>
                {words(t)}
              </option>
            ))}
          </Select>
          <MoreFilters
            active={[action, userId, from || to].filter(Boolean).length}
            onClear={() => (setAction(''), setUserId(''), setFrom(''), setTo(''))}
          >
            <FilterField label="Action">
              <Select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">All</option>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="By">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Anyone</option>
                {(data?.users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? `User ${u.id}`}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="From">
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </FilterField>
            <FilterField label="To">
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </FilterField>
          </MoreFilters>
        </div>
        {error ? (
          <div className="p-4">
            <ErrorBox error={error} />
          </div>
        ) : (
          <>
            <div className={`divide-y divide-slate-100 ${isFetching ? 'opacity-60' : ''}`}>
              {isLoading && <div className="p-6 text-center text-slate-500">Loading…</div>}
              {data && data.rows.length === 0 && (
                <div className="p-8 text-center text-slate-500">No log entries match these filters.</div>
              )}
              {data?.rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[190px_220px_1fr]"
                >
                  <div className="text-[13px] text-slate-500">
                    <div className="font-medium text-slate-800">{fmtDateTime(r.createdAt)}</div>
                    <div>{r.byName ?? 'Not signed in'}</div>
                    <div className="text-slate-400">{SOURCE_LABELS[r.source] ?? r.source}</div>
                  </div>
                  <div>
                    <Badge tone={ACTION_TONE[r.action] ?? 'slate'}>
                      {ACTION_LABELS[r.action] ?? words(r.action)}
                    </Badge>
                    <div className="mt-1 text-[13px] text-slate-600">
                      {words(r.tableName)} <span className="text-slate-400">#{r.recordId}</span>
                    </div>
                  </div>
                  <div className="min-w-0 text-[14px]">
                    <AuditChanges row={r} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[14px] text-slate-600">
              <span>
                {data ? `${data.total.toLocaleString()} entr${data.total === 1 ? 'y' : 'ies'}` : ''} · page{' '}
                {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Newer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Older
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** Role label for any account (staff or owner). */
export const roleLabel = (r: Role) => ROLE_LABELS[r];
