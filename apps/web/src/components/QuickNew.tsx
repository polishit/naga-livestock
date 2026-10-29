import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  CircleAlert,
  ClipboardList,
  FileWarning,
  Plus,
  Syringe,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { RegisterRaiser } from '@/dialogs/RegisterRaiser';
import { Button } from './ui';

const ITEM =
  'flex cursor-pointer items-start gap-2.5 rounded-md px-3 py-2 text-left outline-none data-[highlighted]:bg-slate-50';

/** "+ New" in the top bar: the everyday jobs, one click away from any page. */
export function QuickNew() {
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const [raiser, setRaiser] = useState(false);
  if (!canEdit) return null;
  const items: { icon: LucideIcon; label: string; hint: string; run: () => void }[] = [
    {
      icon: UserPlus,
      label: 'Register a raiser',
      hint: 'Owner, farm and animals, step by step',
      run: () => setRaiser(true),
    },
    {
      icon: FileWarning,
      label: 'Report a disease case',
      hint: 'Sick or dead animals reported',
      run: () => navigate('/cases/new'),
    },
    {
      icon: Syringe,
      label: 'Record a vaccination',
      hint: 'A group or a tagged animal',
      run: () => navigate('/vaccinations?new=1'),
    },
    {
      icon: ClipboardList,
      label: 'Update a head count',
      hint: 'Monthly count for a farm',
      run: () => navigate('/population'),
    },
    {
      icon: CircleAlert,
      label: 'Report a stray animal',
      hint: 'Found wandering or impounded',
      run: () => navigate('/strays?new=1'),
    },
  ];
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button size="sm" className="shrink-0" aria-label="New">
            <Plus /> <span className="hidden sm:inline">New</span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-[1100] w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
          >
            {items.map(({ icon: Icon, label, hint, run }) => (
              <DropdownMenu.Item key={label} onSelect={run} className={ITEM}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" />
                <span>
                  <span className="block text-[14px] font-medium text-slate-900">{label}</span>
                  <span className="block text-[12.5px] text-slate-500">{hint}</span>
                </span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <RegisterRaiser open={raiser} onOpenChange={setRaiser} />
    </>
  );
}