import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, api, isQueued, mutate, reverseGeocode, type MutateOptions } from './api';
import { pendingCount } from './offline';

/** GET helper keyed by URL. */
export function useApi<T>(url: string | null, opts?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>) {
  return useQuery<T>({
    queryKey: [url],
    queryFn: () => api.get<T>(url!),
    enabled: !!url,
    ...opts,
  });
}

export interface Lookups {
  owners: { id: number; code: string; fullName: string; barangay: string; zone: string | null }[];
  farms: {
    id: number;
    code: string;
    name: string;
    ownerId: number;
    barangay: string;
    zone: string | null;
    type: string;
    lat: number | null;
    lng: number | null;
  }[];
  groups: {
    id: number;
    code: string;
    farmId: number;
    farmName: string;
    species: string;
    breed: string | null;
    sex: string;
    lifeStage: string;
    count: number;
    tagged: number;
  }[];
  animals: { id: number; code: string; earTag: string | null; species: string; farmId: number }[];
  inspectors: { id: number; name: string }[];
}

export function useLookups() {
  return useApi<Lookups>('/api/lookups', { staleTime: 30_000 });
}

export interface FarmSpecies {
  species: string;
  /** Head count of this species on the farm (all its active groups). */
  head: number;
  groups: number;
}

/** Species a farm actually keeps, from its population groups, with head counts. */
export function speciesOnFarm(lookups: Lookups | undefined, farmId: number | string | null | undefined) {
  const map = new Map<string, FarmSpecies>();
  for (const g of lookups?.groups ?? []) {
    if (String(g.farmId) !== String(farmId ?? '')) continue;
    const s = map.get(g.species) ?? { species: g.species, head: 0, groups: 0 };
    s.head += g.count;
    s.groups += 1;
    map.set(g.species, s);
  }
  return [...map.values()].sort((a, b) => b.head - a.head);
}

/**
 * Mutation wrapper: performs the write (queueing offline), refreshes all queries,
 * shows a toast and maps server-side field errors onto the form.
 */
export function useSave<TBody, TRes = unknown>(
  method: 'POST' | 'PATCH' | 'PUT',
  url: string | ((body: TBody) => string),
  opts: {
    success: string;
    label?: (body: TBody) => string;
    form?: UseFormReturn<any>;
    files?: () => File[];
    photoField?: string;
    offline?: boolean;
    onDone?: (res: TRes | { queued: true }) => void;
  },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => {
      const u = typeof url === 'function' ? url(body) : url;
      const mo: MutateOptions = {
        label: opts.label ? opts.label(body) : opts.success,
        files: opts.files?.() ?? [],
        photoField: opts.photoField,
        offline: opts.offline,
      };
      return mutate<TRes>(method, u, body, mo);
    },
    onSuccess: (res) => {
      if (isQueued(res)) toast.info('Saved offline — it will sync automatically when you are back online.');
      else toast.success(opts.success);
      qc.invalidateQueries();
      opts.onDone?.(res);
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        if (e.fieldErrors && opts.form) {
          let first = true;
          for (const [field, msgs] of Object.entries(e.fieldErrors)) {
            opts.form.setError(field as any, { type: 'server', message: msgs[0] }, { shouldFocus: first });
            first = false;
          }
          toast.error('Please correct the highlighted fields.');
        } else {
          toast.error(e.message);
        }
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    },
  });
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function usePendingCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const update = () =>
      pendingCount()
        .then(setN)
        .catch(() => setN(0));
    update();
    window.addEventListener('outbox-changed', update);
    return () => window.removeEventListener('outbox-changed', update);
  }, []);
  return n;
}

export type AddressLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'filled'; barangay: string | null }
  | { status: 'kept'; suggestion: string; barangay: string | null }
  | { status: 'failed' };

/**
 * Fill a form's address (and barangay) from a point clicked on the map.
 * An address the user typed themselves is never overwritten; it is offered as a suggestion instead.
 */
export function useAddressLookup(form: UseFormReturn<any>, fields: { address: string; barangay?: string }) {
  const [state, setState] = useState<AddressLookupState>({ status: 'idle' });
  const lastAuto = useRef('');
  const seq = useRef(0);

  const setAddress = (address: string) => {
    form.setValue(fields.address, address, { shouldDirty: true });
    form.clearErrors(fields.address);
    lastAuto.current = address;
  };

  const lookup = async (lat: number, lng: number) => {
    const id = ++seq.current;
    setState({ status: 'loading' });
    try {
      const r = await reverseGeocode(lat, lng);
      if (id !== seq.current) return; // a newer click took over
      if (fields.barangay && r.barangay) {
        form.setValue(fields.barangay, r.barangay, { shouldDirty: true });
        form.clearErrors(fields.barangay);
      }
      const current = String(form.getValues(fields.address) ?? '').trim();
      if (!r.address) setState({ status: 'failed' });
      else if (!current || current === lastAuto.current) {
        setAddress(r.address);
        setState({ status: 'filled', barangay: r.barangay });
      } else if (current !== r.address) {
        setState({ status: 'kept', suggestion: r.address, barangay: r.barangay });
      } else setState({ status: 'filled', barangay: r.barangay });
    } catch {
      if (id === seq.current) setState({ status: 'failed' });
    }
  };

  const applySuggestion = () => {
    if (state.status !== 'kept') return;
    setAddress(state.suggestion);
    setState({ status: 'filled', barangay: state.barangay });
  };

  const reset = () => {
    seq.current++;
    lastAuto.current = '';
    setState({ status: 'idle' });
  };

  return { state, lookup, applySuggestion, reset };
}

/** After a farm gets a map pin, offer to give its open cases that have no location the same pin. */
export function offerFarmLocationForCases(farmId: number, count: number | undefined, onDone: () => void) {
  if (!count) return;
  toast(`${count} open case(s) on this farm are awaiting geotagging.`, {
    duration: 15000,
    action: {
      label: 'Use farm location',
      onClick: async () => {
        try {
          const r = await api.post<{ updated: number }>(`/api/farms/${farmId}/locate-cases`);
          toast.success(`Farm location applied to ${r.updated} case(s).`);
          onDone();
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : 'Could not update the cases');
        }
      },
    },
  });
}

/** Shorthand to reset a react-hook-form when a dialog opens. */
export function useResetOnOpen<T extends FieldValues>(open: boolean, form: UseFormReturn<T>, values: T) {
  useEffect(() => {
    if (open) form.reset(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export const UNSAVED_MESSAGE = 'You have information in this form that has not been saved. Leave anyway?';

/**
 * Unsaved-changes guard for a full-page form: warns before closing or reloading the tab, and before
 * following a link elsewhere in the app, while `dirty` is true.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname) return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}

/** Naga City barangay boundaries (GeoJSON in /public/geo), loaded once and kept for the session. */
export function useBarangayShapes() {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['barangay-shapes'],
    queryFn: async () => {
      const r = await fetch('/geo/naga-barangays.geojson');
      if (!r.ok) throw new Error('Could not load the barangay boundaries');
      return r.json();
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}