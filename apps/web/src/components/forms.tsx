import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MapPin, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import { MAX_PHOTOS, MAX_PHOTO_MB } from '@livestock/shared';
import type { AddressLookupState } from '@/lib/hooks';
import { Button } from './ui';

/** react-hook-form bound to a shared Zod schema. Values are kept loose (form strings). */
export function useZodForm(schema: ZodTypeAny, defaultValues: Record<string, any> = {}): UseFormReturn<any> {
  return useForm<any>({ resolver: zodResolver(schema) as any, defaultValues, mode: 'onSubmit' });
}

/** Read an error message for a field from a react-hook-form errors object. */
export function err(errors: Record<string, any>, name: string): string | undefined {
  const e = errors[name];
  return e?.message ? String(e.message) : undefined;
}

/**
 * Photo picker: up to MAX_PHOTOS photos, each at most MAX_PHOTO_MB.
 * `existing` are photos already saved (storage keys); `files` are new photos chosen now.
 */
export function PhotoPicker({
  files,
  onFilesChange,
  existing = [],
  onExistingChange,
  max = MAX_PHOTOS,
  maxMb = MAX_PHOTO_MB,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  existing?: string[];
  onExistingChange?: (keys: string[]) => void;
  max?: number;
  maxMb?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  const total = existing.length + files.length;

  const add = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const ok = picked.filter((f) => f.size <= maxMb * 1024 * 1024);
    if (ok.length < picked.length) {
      toast.error(`${picked.length - ok.length} photo(s) skipped — each photo must be ${maxMb} MB or smaller.`);
    }
    const room = max - total;
    if (ok.length > room) toast.error(`You can attach up to ${max} photos. Extra photos were not added.`);
    if (room > 0 && ok.length) onFilesChange([...files, ...ok.slice(0, room)]);
  };

  const tile = 'relative h-20 w-20 overflow-hidden rounded-md border border-slate-300 bg-white';
  const removeBtn = (onClick: () => void) => (
    <button
      type="button"
      aria-label="Remove photo"
      onClick={onClick}
      className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white hover:bg-red-600"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {existing.map((key) => (
          <div key={key} className={tile}>
            <img src={`/api/files/${key}`} alt="Saved photo" className="h-full w-full object-cover" />
            {onExistingChange && removeBtn(() => onExistingChange(existing.filter((k) => k !== key)))}
          </div>
        ))}
        {previews.map((src, i) => (
          <div key={src} className={tile}>
            <img src={src} alt={`New photo ${i + 1}`} className="h-full w-full object-cover" />
            {removeBtn(() => onFilesChange(files.filter((_, j) => j !== i)))}
          </div>
        ))}
        {total === 0 && (
          <div className="flex h-20 w-[112px] items-center justify-center rounded-md border border-dashed border-slate-400 bg-white text-[13px] text-slate-400">
            No image
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={total >= max}
          onClick={() => ref.current?.click()}
        >
          <Upload /> {total ? 'Add more photos' : 'Choose images'}
        </Button>
        <span className="text-[12.5px] text-slate-500">
          {total} / {max} photos · JPG, PNG or WEBP · max {maxMb} MB each
        </span>
      </div>
      <input
        ref={ref}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** One-line status under a map whose clicks fill in the address. */
export function AddressLookupHint({
  state,
  onApplySuggestion,
}: {
  state: AddressLookupState;
  onApplySuggestion: () => void;
}) {
  if (state.status === 'idle') return null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-500" role="status">
      {state.status === 'loading' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up the address…
        </>
      )}
      {state.status === 'filled' && (
        <>
          <MapPin className="h-3.5 w-3.5 text-brand-dark" /> Address filled in from the map
          {state.barangay ? ` (Barangay ${state.barangay})` : ''} — you can edit it.
        </>
      )}
      {state.status === 'kept' && (
        <>
          Kept the address you typed. Map address: “{state.suggestion}”
          <button type="button" className="font-medium text-brand-dark underline" onClick={onApplySuggestion}>
            Use it
          </button>
        </>
      )}
      {state.status === 'failed' && (
        <>Couldn't look up the address (offline or the service is busy). Type it manually.</>
      )}
    </p>
  );
}

/** Read-only thumbnails of saved photos; click to open full size. */
export function PhotoGallery({ keys, className = '' }: { keys: string[]; className?: string }) {
  if (!keys.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {keys.map((k, i) => (
        <a
          key={k}
          href={`/api/files/${k}`}
          target="_blank"
          rel="noreferrer"
          className="block h-20 w-20 overflow-hidden rounded-md border border-slate-300 hover:ring-2 hover:ring-brand"
        >
          <img src={`/api/files/${k}`} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}