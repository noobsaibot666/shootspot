import { photoMeta, type PhotoMeta } from '@shootspot/shared';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Gallery import (D-28): the member picks up to 20 photos, then reviews them one by one through
 * the same crop → pin → notes → publish steps as a camera capture. The batch is copied into the
 * app's documents and persisted, so unfinished photos survive closing the app and can be finished
 * later from Profile. Photo metadata prefills the pin, time and direction; it never leaves the
 * phone (the published image is re-encoded without it).
 */
export const IMPORT_LIMIT = 20;

export interface ImportItem {
  id: string;
  /** Copy inside the app's documents. */
  uri: string;
  meta: PhotoMeta;
  state: 'todo' | 'done';
  /** Draft id once published, to link back to its status. */
  draftId: string | null;
}

const root = () => new Directory(Paths.document, 'imports');
const queueFile = () => new File(root(), 'queue.json');

const listeners = new Set<() => void>();
export function subscribeImports(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function listImports(): Promise<ImportItem[]> {
  const f = queueFile();
  if (!f.exists) return [];
  try {
    return JSON.parse(await f.text()) as ImportItem[];
  } catch {
    return [];
  }
}

async function save(items: ImportItem[]) {
  const r = root();
  if (!r.exists) r.create({ intermediates: true });
  const f = queueFile();
  if (!f.exists) f.create({ overwrite: true });
  await f.write(JSON.stringify(items));
  listeners.forEach((fn) => fn());
}

/**
 * Opens the system photo picker. Returns how many photos were added, 0 when cancelled.
 * Android's modern picker removes GPS from photos, so the legacy picker is used there.
 */
export async function pickPhotos(): Promise<number> {
  const existing = await listImports();
  const open = existing.filter((i) => i.state === 'todo').length;
  const room = IMPORT_LIMIT - open;
  if (room <= 0) return 0;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: room,
    orderedSelection: true,
    exif: true,
    quality: 1,
    legacy: Platform.OS === 'android',
  });
  if (result.canceled) return 0;

  const r = root();
  if (!r.exists) r.create({ intermediates: true });
  const added: ImportItem[] = [];
  for (const asset of result.assets.slice(0, room)) {
    const id = Crypto.randomUUID();
    const ext = (asset.fileName?.split('.').pop() ?? 'jpg').toLowerCase().slice(0, 5);
    const target = new File(r, `${id}.${ext}`);
    try {
      new File(asset.uri).copy(target);
    } catch {
      continue;
    }
    added.push({ id, uri: target.uri, meta: photoMeta(asset.exif), state: 'todo', draftId: null });
  }
  await save([...existing.filter((i) => i.state === 'todo'), ...added]);
  return added.length;
}

export async function markImported(id: string, draftId: string) {
  const items = await listImports();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  item.state = 'done';
  item.draftId = draftId;
  await save(items);
}

export async function removeImport(id: string) {
  const items = await listImports();
  const item = items.find((i) => i.id === id);
  if (item) {
    try {
      new File(item.uri).delete();
    } catch {}
  }
  await save(items.filter((i) => i.id !== id));
}

/** Drops finished items and their files (the published draft keeps its own copy). */
export async function clearFinishedImports() {
  const items = await listImports();
  for (const i of items.filter((x) => x.state === 'done')) {
    try {
      new File(i.uri).delete();
    } catch {}
  }
  await save(items.filter((i) => i.state === 'todo'));
}
