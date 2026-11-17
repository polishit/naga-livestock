import { Camera, IdCard, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MAX_PHOTO_MB } from '@livestock/shared';
import { cn } from '@/lib/utils';

/**
 * One photo of an ID (front or back): a large box to take or choose the photo, with a preview.
 * `current` is a photo already sent (shown until a new one is chosen).
 */
export function IdPhotoInput({
  label,
  file,
  onChange,
  current,
  error,
  optional,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  current?: string | null;
  error?: string;
  optional?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const shown = preview ?? current ?? null;
  const id = `id-photo-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-medium text-slate-800">
        {label}
        {optional ? <span className="font-normal text-slate-500"> (optional)</span> : ' *'}
      </label>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={cn(
          'relative flex aspect-[1.6] w-full max-w-sm items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-slate-50 text-slate-500 hover:bg-slate-100',
          error ? 'border-red-400' : 'border-slate-300',
        )}
        aria-describedby={error ? `${id}-err` : undefined}
      >
        {shown ? (
          <>
            <img src={shown} alt={label} className="h-full w-full object-contain" />
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[13px] text-white">
              <RefreshCw className="h-3.5 w-3.5" /> Replace
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-[14px]">
            <span className="flex items-center gap-2 text-slate-600">
              <IdCard className="h-7 w-7" />
              <Camera className="h-6 w-6" />
            </span>
            Take or choose a clear photo. All four corners should show and the text should be readable.
          </span>
        )}
      </button>
      <input
        id={id}
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (f && f.size > MAX_PHOTO_MB * 1024 * 1024) {
            toast.error(`The photo must be ${MAX_PHOTO_MB} MB or smaller.`);
            return;
          }
          onChange(f);
        }}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-[13px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
