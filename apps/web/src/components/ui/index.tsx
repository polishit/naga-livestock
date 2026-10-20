import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown, Loader2, X } from 'lucide-react';
import {
  Fragment,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/* ---------------- Button ---------------- */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white shadow-sm hover:bg-[#6c9f5b]',
        outline: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
        ghost: 'text-slate-700 hover:bg-slate-100',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        link: 'text-brand-dark underline-offset-4 hover:underline px-0',
      },
      size: {
        default: 'h-10 px-4 text-[15px] [&_svg]:h-4 [&_svg]:w-4',
        sm: 'h-8 px-3 text-[13.5px] [&_svg]:h-3.5 [&_svg]:w-3.5',
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
  'w-full rounded-md border border-slate-300 bg-white px-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:bg-slate-50 aria-[invalid=true]:border-red-400';

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

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }
>(({ className, wrapperClassName, children, ...props }, ref) => (
  <div className={cn('relative', wrapperClassName)}>
    <select ref={ref} className={cn(fieldBase, 'h-10 appearance-none pr-9', className)} {...props}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
  </div>
));
Select.displayName = 'Select';

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('mb-1.5 block text-[13.5px] font-medium text-slate-700', className)}
    >
      {children}
    </label>
  );
}

/** Label + control + error/hint. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const autoId = useId();
  // Associate the label with a single child control automatically (accessibility + testability).
  const single =
    isValidElement(children) && children.type !== Fragment
      ? (children as React.ReactElement<{ id?: string }>)
      : null;
  const controlId = htmlFor ?? (single ? (single.props.id ?? autoId) : undefined);
  const control = single && !single.props.id && !htmlFor ? cloneElement(single, { id: autoId }) : children;
  return (
    <div className={className}>
      {label && <Label htmlFor={controlId}>{label}</Label>}
      {control}
      {error ? (
        <p className="mt-1 text-[13px] text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[12.5px] text-slate-400">{hint}</p>
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
      <h3 className="card-title">{title}</h3>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Badge ---------------- */

export type Tone = 'green' | 'red' | 'orange' | 'amber' | 'slate' | 'blue' | 'violet' | 'redSoft';
const toneClass: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
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
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium leading-5',
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const width = {
    sm: 'sm:max-w-[460px]',
    md: 'sm:max-w-[576px]',
    lg: 'sm:max-w-[1024px]',
    xl: 'sm:max-w-[1180px]',
  }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1000] bg-slate-900/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-[1001] flex max-h-[100dvh] w-full flex-col bg-white shadow-xl outline-none',
            'inset-x-0 bottom-0 rounded-t-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[92vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95',
            width,
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <DialogPrimitive.Title className="text-[17px] font-semibold text-slate-900">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
              {footer}
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
              '-mb-px border-b-2 px-3 py-2.5 text-[15px] transition-colors',
              value === t.id
                ? 'border-brand-dark font-medium text-brand-dark'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
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
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
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
        className="h-4 w-4 rounded border-slate-300 accent-[#1d6fd8]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
