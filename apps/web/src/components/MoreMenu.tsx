import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui';

export interface MoreItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Red text for actions that remove something. */
  danger?: boolean;
  /** One line under the label, e.g. when it is allowed. */
  hint?: string;
}

/**
 * "More" on every record: Archive / Restore, Void and Delete live here, in the same place on each page.
 * Items that do not apply are simply left out by the page.
 */
export function MoreMenu({
  items,
  size = 'default',
}: {
  items: (MoreItem | false | null | undefined)[];
  size?: 'default' | 'xs';
}) {
  const shown = items.filter(Boolean) as MoreItem[];
  if (!shown.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size={size} aria-label="More actions">
          <MoreHorizontal /> {size === 'default' && 'More'}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[1100] min-w-56 max-w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          {shown.map(({ label, icon: Icon, onSelect, danger, hint }) => (
            <DropdownMenu.Item
              key={label}
              onSelect={onSelect}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-[14px] outline-none data-[highlighted]:bg-slate-50',
                danger ? 'text-red-600' : 'text-slate-700',
              )}
            >
              {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>
                <span className="block">{label}</span>
                {hint && <span className="block text-[12px] text-slate-500">{hint}</span>}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
