import Dexie, { type Table } from 'dexie';

/** A write that could not reach the API and will be replayed when the connection returns. */
export interface OutboxItem {
  id?: number;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  body?: unknown;
  /** Photos to upload first; their storage keys are appended to body[photoField]. */
  files?: { blob: Blob; name: string }[];
  photoField?: string;
  label: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

class OfflineDB extends Dexie {
  outbox!: Table<OutboxItem, number>;
  constructor() {
    super('naga-livestock');
    this.version(1).stores({ outbox: '++id, createdAt' });
  }
}

export const db = new OfflineDB();

export async function enqueue(item: Omit<OutboxItem, 'id' | 'createdAt' | 'attempts'>) {
  const id = await db.outbox.add({ ...item, createdAt: Date.now(), attempts: 0 });
  window.dispatchEvent(new Event('outbox-changed'));
  return id;
}

export function pendingCount() {
  return db.outbox.count();
}

let syncing = false;

/**
 * Replay queued writes in order. Network failures stop the run (we are still offline);
 * validation failures (4xx) are kept with their error so the user can see them.
 */
export async function syncOutbox(
  send: (method: string, url: string, body?: unknown) => Promise<Response>,
  upload: (file: Blob, name: string) => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  if (syncing || !navigator.onLine) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const items = await db.outbox.orderBy('createdAt').toArray();
    for (const item of items) {
      try {
        let body = item.body as Record<string, unknown> | undefined;
        if (item.files?.length && item.photoField) {
          const keys: string[] = [];
          for (const f of item.files) keys.push(await upload(f.blob, f.name));
          const current = (body?.[item.photoField] as string[] | undefined) ?? [];
          body = { ...(body ?? {}), [item.photoField]: [...current, ...keys] };
        }
        const res = await send(item.method, item.url, body);
        if (res.ok) {
          await db.outbox.delete(item.id!);
          synced++;
        } else if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408) {
          const data = await res.json().catch(() => ({}));
          await db.outbox.update(item.id!, {
            attempts: item.attempts + 1,
            lastError: data.error ?? `HTTP ${res.status}`,
          });
          failed++;
        } else {
          break; // server/auth problem — try again later
        }
      } catch {
        break; // still offline
      }
    }
  } finally {
    syncing = false;
    window.dispatchEvent(new Event('outbox-changed'));
  }
  return { synced, failed };
}
