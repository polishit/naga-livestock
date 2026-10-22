import { enqueue, syncOutbox } from './offline';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export interface Queued {
  queued: true;
}
export const isQueued = (x: unknown): x is Queued =>
  !!x && typeof x === 'object' && (x as Queued).queued === true;

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

async function rawFetch(method: string, url: string, body?: unknown, retry = true): Promise<Response> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (res.status === 401 && retry && !url.startsWith('/api/auth/')) {
    if (await refreshSession()) return rawFetch(method, url, body, false);
    window.dispatchEvent(new Event('auth-expired'));
  }
  return res;
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  const data = await res.json().catch(() => ({}));
  const fallback =
    res.status >= 502
      ? "Can't reach the server. Make sure the app is running, then try again in a few seconds."
      : `Request failed (${res.status})`;
  throw new ApiError(res.status, data.error ?? fallback, data.fieldErrors);
}

export const api = {
  get: <T>(url: string) => rawFetch('GET', url).then((r) => handle<T>(r)),
  post: <T>(url: string, body?: unknown) => rawFetch('POST', url, body).then((r) => handle<T>(r)),
  patch: <T>(url: string, body?: unknown) => rawFetch('PATCH', url, body).then((r) => handle<T>(r)),
  put: <T>(url: string, body?: unknown) => rawFetch('PUT', url, body).then((r) => handle<T>(r)),
};

export async function uploadFile(file: Blob, name = 'photo.jpg', folder = 'photos'): Promise<string> {
  const fd = new FormData();
  fd.append('folder', folder);
  fd.append('file', file, name);
  const out = await handle<{ key: string }>(await rawFetch('POST', '/api/uploads', fd));
  return out.key;
}

export interface MutateOptions {
  /** Human label shown in the offline queue, e.g. "Register owner Juan Dela Cruz". */
  label: string;
  /** Allow queueing while offline (default true). */
  offline?: boolean;
  /** Photos to upload first; their keys are appended to body[photoField] (an array). */
  files?: File[];
  photoField?: string;
}

/**
 * Perform a write. When the device is offline (or the network drops) the write is stored in
 * IndexedDB and replayed automatically once the connection returns.
 */
export async function mutate<T>(
  method: 'POST' | 'PATCH' | 'PUT',
  url: string,
  body: unknown,
  opts: MutateOptions,
): Promise<T | Queued> {
  const allowOffline = opts.offline !== false;
  const queue = async () => {
    await enqueue({
      method,
      url,
      body,
      label: opts.label,
      files: opts.files?.map((f) => ({ blob: f, name: f.name })),
      photoField: opts.photoField,
    });
    return { queued: true } as Queued;
  };
  if (!navigator.onLine && allowOffline) return queue();
  try {
    let payload = body as Record<string, unknown>;
    if (opts.files?.length && opts.photoField) {
      const keys: string[] = [];
      for (const f of opts.files) keys.push(await uploadFile(f, f.name));
      const current = (payload?.[opts.photoField] as string[] | undefined) ?? [];
      payload = { ...(payload ?? {}), [opts.photoField]: [...current, ...keys] };
    }
    const res = await rawFetch(method, url, payload);
    return await handle<T>(res);
  } catch (e) {
    if (e instanceof TypeError && allowOffline) return queue();
    throw e;
  }
}

/** Address and barangay for a point on the map (looked up by the API). */
export interface ReverseGeocodeResult {
  address: string;
  barangay: string | null;
}
export const reverseGeocode = (lat: number, lng: number) =>
  api.get<ReverseGeocodeResult>(`/api/geocode/reverse?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`);

export function runSync() {
  return syncOutbox(
    (method, url, body) => rawFetch(method, url, body),
    (file, name) => uploadFile(file, name),
  );
}