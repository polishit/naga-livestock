import { RADIUS_OPTIONS, formatRadius } from '@livestock/shared';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui';

/** One dropdown for choosing a radius (used everywhere a radius is picked). */
export function RadiusSelect({
  value,
  onChange,
  className,
  label = 'Radius',
}: {
  value: number;
  onChange: (m: number) => void;
  className?: string;
  label?: string;
}) {
  const options = [...new Set<number>([...RADIUS_OPTIONS, value])].sort((a, b) => a - b);
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('w-auto min-w-[7.5rem]', className)}
    >
      {options.map((r) => (
        <option key={r} value={r}>
          {formatRadius(r)}
        </option>
      ))}
    </Select>
  );
}
