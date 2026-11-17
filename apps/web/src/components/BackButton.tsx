import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The back arrow used on every page and detail panel: to the parent page when `to` is given,
 * otherwise to the previous screen. Icon only: the label is read out by screen readers.
 */
export function BackButton({
  to,
  onClick,
  label = 'Back',
  className,
  tone = 'default',
}: {
  /** The parent page. Omit to go to the previous screen. */
  to?: string;
  /** Run this instead of navigating (e.g. close a detail panel). */
  onClick?: () => void;
  label?: string;
  className?: string;
  tone?: 'default' | 'light';
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        if (onClick) return onClick();
        if (to) return navigate(to);
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate('/');
      }}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong',
        tone === 'light'
          ? 'text-white hover:bg-white/15 active:bg-white/25'
          : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200',
        className,
      )}
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
