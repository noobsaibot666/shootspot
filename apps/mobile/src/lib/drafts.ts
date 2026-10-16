import type { CreateRecordResponse, DraftRecord, RecordStatusResponse } from '@shootspot/shared';
import { Directory, File, Paths } from 'expo-file-system';
import { ApiError, api } from './api';

/**
 * Local drafts (plan journey 4: "save a draft locally if capture or upload fails").
 * A draft is a folder: draft.json + photo.jpg. Publishing walks create → upload → confirm and
 * persists after every step, so it resumes after a crash, a lost network or an app restart.
 * The server is idempotent on draftId, so a retry never creates a second record.
 */

export type DraftState =
  'ready' | 'creating' | 'uploading' | 'confirming' | 'processing' | 'done' | 'failed';

export interface LocalDraft {
  draft: DraftRecord;
  photo: { width: number; height: number };
  state: DraftState;
  recordId: string | null;
  error: string | null;
  updatedAt: string;
}

const root = () => new Directory(Paths.document, 'drafts');
const dir = (id: string) => new Directory(root(), id);
const metaFile = (id: string) => new File(dir(id), 'draft.json');
export const photoFile = (id: string) => new File(dir(id), 'photo.jpg');

const listeners = new Set<() => void>();
export function subscribeDrafts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

async function write(d: LocalDraft) {
  d.updatedAt = new Date().toISOString();
  const f = metaFile(d.draft.draftId);
  if (!f.exists) f.create({ intermediates: true, overwrite: true });
  await f.write(JSON.stringify(d));
  notify();
}

/** Save a new draft with its (already cropped, EXIF-free) photo. */
export async function saveDraft(
  draft: DraftRecord,
  photoUri: string,
  photo: { width: number; height: number },
) {
  const d = dir(draft.draftId);
  if (!d.exists) d.create({ intermediates: true });
  await new File(photoUri).copy(photoFile(draft.draftId));
  const local: LocalDraft = {
    draft,
    photo,
    state: 'ready',
    recordId: null,
    error: null,
    updatedAt: '',
  };
  await write(local);
  return local;
}

export async function listDrafts(): Promise<LocalDraft[]> {
  const r = root();
  if (!r.exists) return [];
  const out: LocalDraft[] = [];
  for (const entry of r.list()) {
    if (!(entry instanceof Directory)) continue;
    const meta = new File(entry, 'draft.json');
    if (meta.exists) {
      try {
        out.push(JSON.parse(await meta.text()) as LocalDraft);
      } catch {}
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDraft(id: string): Promise<LocalDraft | null> {
  const meta = metaFile(id);
  return meta.exists ? (JSON.parse(await meta.text()) as LocalDraft) : null;
}

export function discardDraft(id: string) {
  const d = dir(id);
  if (d.exists) d.delete();
  notify();
}

const running = new Set<string>();

/**
 * Push a draft as far as it can go. Safe to call repeatedly (e.g. on app start / foreground).
 * Ends in 'processing' (the server takes over), 'failed' (retry later), or throws nothing.
 */
export async function submitDraft(id: string): Promise<LocalDraft | null> {
  if (running.has(id)) return getDraft(id);
  running.add(id);
  try {
    const d = await getDraft(id);
    if (!d || d.state === 'done' || d.state === 'processing') return d;
    try {
      // 1. Create (idempotent): also returns a fresh upload URL while the photo is missing.
      d.state = 'creating';
      d.error = null;
      await write(d);
      const created = await api<CreateRecordResponse>('/v1/records', {
        method: 'POST',
        body: d.draft,
      });
      d.recordId = created.recordId;

      // 2. Upload the photo straight to storage (presigned PUT), unless already received.
      if (created.upload) {
        d.state = 'uploading';
        await write(d);
        const res = await photoFile(id).upload(created.upload.url, {
          httpMethod: 'PUT',
          headers: created.upload.headers,
          mimeType: 'image/jpeg',
        });
        if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, 'upload_failed');
      }

      // 3. Confirm; the server validates the image and publishes it.
      d.state = 'confirming';
      await write(d);
      await api<RecordStatusResponse>(`/v1/records/${d.recordId}/upload-complete`, {
        method: 'POST',
      });
      d.state = 'processing';
      await write(d);
      return d;
    } catch (err) {
      d.state = 'failed';
      d.error = err instanceof ApiError ? err.code : 'unknown';
      await write(d);
      return d;
    }
  } finally {
    running.delete(id);
  }
}

/**
 * Retry everything that hasn't reached the server yet, and settle drafts the server has finished
 * with. A 404 means the record isn't on this server (deleted, or made against another backend
 * during testing), so the local copy can't progress and is dropped instead of spinning forever.
 */
export async function resumeDrafts() {
  for (const d of await listDrafts()) {
    if (d.state === 'processing' && d.recordId) {
      try {
        const s = await api<RecordStatusResponse>(`/v1/records/${d.recordId}/status`);
        if (s.status !== 'processing' && s.status !== 'pending_media')
          await settleDraft(d.draft.draftId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) discardDraft(d.draft.draftId);
      }
    } else if (d.state !== 'done' && d.state !== 'processing') {
      await submitDraft(d.draft.draftId);
    }
  }
}

/** Once the server has the record (published or rejected), the local copy is no longer needed. */
export async function settleDraft(id: string) {
  const d = await getDraft(id);
  if (!d) return;
  d.state = 'done';
  await write(d);
  discardDraft(id);
}
