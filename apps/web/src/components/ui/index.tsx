import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown, Loader2, X } from 'lucide-react';
import {
  Children,
  Fragment,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useState,
  type SyntheticEvent,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn, headTitle, toTitle } from '@/lib/utils';

/* ---------------- Button ---------------- */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-strong text-white shadow-sm hover:bg-brand-dark',
        outline: 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50',
        ghost: 'text-slate-700 hover:bg-slate-100',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        link: 'text-brand-dark underline-offset-4 hover:underline px-0',
      },
      size: {
        default: 'h-10 px-4 text-[15px] [&_svg]:h-4 [&_svg]:w-4',
        sm: 'h-8 px-3 text-[14px] [&_svg]:h-3.5 [&_svg]:w-3.5',
        xs: 'h-7 px-2.5 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5',
        icon: 'h-9 w-9 [&_svg]:h-5 [&_svg]:w-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

/* ---------------- Inputs ---------------- */

const fieldBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:bg-slate-50 aria-[invalid=true]:border-red-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-[78px] py-2', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

/**
 * Colour code for status and result values, used by every dropdown so Positive / Negative and the
 * stages of a record can be told apart at a glance (same colours as the badges).
 */
export const VALUE_TONES: Record<string, Tone> = {
  POSITIVE: 'red',
  NEGATIVE: 'green',
  PENDING: 'amber',
  INCONCLUSIVE: 'violet',
  SUSPECTED: 'orange',
  SAMPLE_COLLECTED: 'orange',
  SENT_TO_LAB: 'blue',
  REPORTED: 'blue',
  REQUESTED: 'amber',
  SCHEDULED: 'blue',
  ONGOING: 'blue',
  DONE: 'green',
  COMPLETED: 'green',
  VERIFIED: 'green',
  APPROVED: 'green',
  RETURNED: 'amber',
  DECLINED: 'red',
  REJECTED: 'red',
  CANCELLED: 'slate',
  CLOSED: 'slate',
  VOIDED: 'slate',
  SICK_ANIMALS: 'red',
  NO_FINDINGS: 'green',
};
const selectTone: Record<Tone, string> = {
  red: 'border-red-300 bg-red-50 text-red-800',
  redSoft: 'border-red-300 bg-red-50 text-red-800',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
  orange: 'border-orange-300 bg-orange-50 text-orange-800',
  blue: 'border-sky-300 bg-sky-50 text-sky-800',
  violet: 'border-violet-300 bg-violet-50 text-violet-800',
  slate: 'border-slate-300 bg-slate-100 text-slate-700',
};
const dotTone: Record<Tone, string> = {
  red: 'bg-red-500',
  redSoft: 'bg-red-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
};
const optionStyle: Record<Tone, { color: string; backgroundColor: string }> = {
  red: { color: '#991b1b', backgroundColor: '#fef2f2' },
  redSoft: { color: '#991b1b', backgroundColor: '#fef2f2' },
  green: { color: '#065f46', backgroundColor: '#ecfdf5' },
  amber: { color: '#92400e', backgroundColor: '#fffbeb' },
  orange: { color: '#9a3412', backgroundColor: '#fff7ed' },
  blue: { color: '#075985', backgroundColor: '#f0f9ff' },
  violet: { color: '#5b21b6', backgroundColor: '#f5f3ff' },
  slate: { color: '#334155', backgroundColor: '#f1f5f9' },
};
export const toneOfValue = (v: unknown): Tone | undefined =>
  typeof v === 'string' && v ? VALUE_TONES[v] : undefined;

/** Adds the colour of each status / result option (native dropdown lists show it on most devices). */
export function toneOptions(children: ReactNode, tones: Record<string, Tone> = VALUE_TONES): ReactNode {
  return Children.map(children, (c) => {
    if (!isValidElement(c) || c.type !== 'option') return c;
    const v = (c.props as { value?: unknown }).value;
    const t = typeof v === 'string' ? tones[v] : undefined;
    return t ? cloneElement(c as React.ReactElement<{ style?: object }>, { style: optionStyle[t] }) : c;
  });
}

/** A coloured dot and tinted box for the chosen status / result. */
export function useToneState(value: unknown, defaultValue: unknown, tones: Record<string, Tone>) {
  const [current, setCurrent] = useState<string>(String(value ?? defaultValue ?? ''));
  useEffect(() => {
    if (value !== undefined) setCurrent(String(value ?? ''));
  }, [value]);
  const tone = current ? tones[current] : undefined;
  return { tone, setCurrent };
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string; tones?: Record<string, Tone> }
>(({ className, wrapperClassName, children, tones = VALUE_TONES, onChange, ...props }, ref) => {
  const { tone, setCurrent } = useToneState(props.value, props.defaultValue, tones);
  // Forms (react-hook-form) set the value without a change event: read it back from the element.
  const setRef = (el: HTMLSelectElement | null) => {
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
    if (el && props.value === undefined) queueMicrotask(() => setCurrent(el.value));
  };
  return (
    <div className={cn('relative', wrapperClassName)}>
      {tone && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full',
            dotTone[tone],
          )}
        />
      )}
      <select
        ref={setRef}
        className={cn(
          fieldBase,
          'h-10 appearance-none pr-9',
          tone && cn('pl-7 font-medium', selectTone[tone]),
          className,
        )}
        onChange={(e) => {
          setCurrent(e.target.value);
          onChange?.(e);
        }}
        {...props}
      >
        {toneOptions(children, tones)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
    </div>
  );
});
Select.displayName = 'Select';

/** A label ending in " *" (or a Field marked required) shows a red asterisk: the field must be filled in. */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden className="req-mark ml-0.5 font-semibold text-red-600">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

export function Label({
  children,
  htmlFor,
  className,
  required,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  required?: boolean;
}) {
  const marked = typeof children === 'string' && /\s\*$/.test(children);
  const text = marked ? (children as string).replace(/\s*\*$/, '') : children;
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-[14px] font-medium text-slate-700', className)}>
      {text}
      {(marked || required) && <RequiredMark />}
    </label>
  );
}

const CONTROL_TYPES = new Set<unknown>(['input', 'select', 'textarea', Input, Select, Textarea]);

/** Label + control + error/hint. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
  required,
}: {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  /** Shows the red required marker (labels ending in " *" get it automatically). */
  required?: boolean;
}) {
  const autoId = useId();
  // Associate the label with its control automatically (accessibility + testability): the only
  // child, or the first child when it is an input, select or text area (e.g. an input + datalist).
  const first = Array.isArray(children) ? children[0] : children;
  const single =
    isValidElement(first) &&
    first.type !== Fragment &&
    (first === children || CONTROL_TYPES.has(first.type as unknown))
      ? (first as React.ReactElement<{ id?: string }>)
      : null;
  const controlId = htmlFor ?? (single ? (single.props.id ?? autoId) : undefined);
  const control =
    single && !single.props.id && !htmlFor
      ? first === children
        ? cloneElement(single, { id: autoId })
        : Children.toArray(children).map((c, i) =>
            i === 0 && isValidElement(c) ? cloneElement(c as typeof single, { id: autoId }) : c,
          )
      : children;
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={controlId} required={required}>
          {label}
        </Label>
      )}
      {control}
      {error ? (
        <p className="mt-1 text-[13px] text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[13px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/* ---------------- Card ---------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card-header', className)}>
      <h3 className="card-title">{typeof title === 'string' ? toTitle(title) : title}</h3>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Badge ---------------- */

export type Tone = 'green' | 'red' | 'orange' | 'amber' | 'slate' | 'blue' | 'violet' | 'redSoft';
const toneClass: Record<Tone, string> = {
  green: 'bg-brand-light text-brand-dark',
  red: 'bg-red-50 text-red-600',
  redSoft: 'bg-red-50 text-red-600',
  orange: 'bg-orange-50 text-orange-600',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
};

export function Badge({
  tone = 'slate',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-5',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Dialog ---------------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  size = 'md',
  guardChanges = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Ask "Discard changes?" before closing a form the user has typed in (default on). */
  guardChanges?: boolean;
}) {
  const width = {
    // One width scale for every form (panel revision: standard form sizes).
    sm: 'sm:max-w-[480px]',
    md: 'sm:max-w-[640px]',
    lg: 'sm:max-w-[960px]',
    xl: 'sm:max-w-[1180px]',
  }[size];
  // Unsaved-changes guard: typing in any form field marks the dialog dirty. Closing it then (tapping
  // outside, Esc, the X, or Cancel/Close) asks first. Saving closes it normally.
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (open) {
      setDirty(false);
      setConfirming(false);
    }
  }, [open]);
  const markDirty = (e: SyntheticEvent) => {
    if (guardChanges && (e.target as HTMLElement).closest?.('form')) setDirty(true);
  };
  const requestClose = () => (guardChanges && dirty ? setConfirming(true) : onOpenChange(false));
  const discard = () => {
    setConfirming(false);
    setDirty(false);
    onOpenChange(false);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1000] bg-slate-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInput={markDirty}
          onChange={markDirty}
          className={cn(
            'dialog-root fixed z-[1001] flex max-h-[100dvh] w-full flex-col bg-white shadow-xl outline-none',
            'inset-x-0 bottom-0 rounded-t-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[92vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95',
            width,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 sm:py-4">
            <DialogPrimitive.Title className="text-[18px] font-semibold text-slate-900">
              {typeof title === 'string' ? headTitle(title) : title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="app-scroll flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div
              className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3.5 sm:py-4 [&>button]:flex-1 sm:[&>button]:flex-none"
              style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}
              onClickCapture={(e) => {
                // The footer's Cancel / Close button goes through the same check.
                const b = (e.target as HTMLElement).closest('button');
                if (
                  guardChanges &&
                  dirty &&
                  b &&
                  b.getAttribute('type') !== 'submit' &&
                  /^(Cancel|Close)$/.test(b.textContent?.trim() ?? '')
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirming(true);
                }
              }}
            >
              {/* Shown only when the form has required fields (CSS :has). */}
              <p className="req-note mr-auto hidden self-center text-[13px] text-slate-500">
                <span className="font-semibold text-red-600">*</span> Required
              </p>
              {footer}
            </div>
          )}
          {confirming && (
            <div
              role="alertdialog"
              aria-label="Discard changes?"
              className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-white/85 p-5 backdrop-blur-[2px]"
            >
              <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
                <div className="text-[16px] font-semibold text-slate-900">Discard changes?</div>
                <p className="mt-1 text-[14px] text-slate-600">
                  You have typed information in this form that has not been saved.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setConfirming(false)} autoFocus>
                    Keep Editing
                  </Button>
                  <Button variant="destructive" onClick={discard}>
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------------- Tabs ---------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div role="tablist" className="flex min-w-max gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px] transition-colors',
              value === t.id
                ? 'border-brand-dark font-medium text-brand-dark'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {typeof t.label === 'string' ? toTitle(t.label) : t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- misc ---------------- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-slate-400', className)} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-12 text-center text-[15px] text-slate-500">{children}</div>;
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[15px] text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 accent-brand-strong"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
