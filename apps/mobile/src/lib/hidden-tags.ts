import type { TagKind } from '@shootspot/shared';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

/**
 * A member's own tag lists, on this phone only:
 * - hidden (D-38): listed tags they never use, so "Wedding" stays out of a sports shooter's way;
 * - personal (D-39): tags they typed themselves, offered again on the next capture.
 * The admin-managed lists (D-25) are unchanged; "Add" brings hidden tags back or adds a new one.
 */
interface MyTags {
  hidden: Record<TagKind, string[]>;
  personal: Record<TagKind, string[]>;
}

const EMPTY: MyTags = {
  hidden: { good_for: [], best_light: [] },
  personal: { good_for: [], best_light: [] },
};
const file = () => new File(Paths.document, 'my-tags.json');
let state: MyTags = EMPTY;
const listeners = new Set<() => void>();

try {
  const f = file();
  if (f.exists) {
    const saved = JSON.parse(f.textSync()) as Partial<MyTags>;
    state = {
      hidden: { ...EMPTY.hidden, ...saved.hidden },
      personal: { ...EMPTY.personal, ...saved.personal },
    };
  }
} catch {}

function set(next: MyTags) {
  state = next;
  listeners.forEach((l) => l());
  try {
    const f = file();
    if (!f.exists) f.create({ overwrite: true });
    void f.write(JSON.stringify(next)).catch(() => {});
  } catch {}
}

const edit = (list: 'hidden' | 'personal', kind: TagKind, fn: (xs: string[]) => string[]) =>
  set({ ...state, [list]: { ...state[list], [kind]: fn(state[list][kind]) } });

export const hideTag = (kind: TagKind, key: string) =>
  edit('hidden', kind, (xs) => (xs.includes(key) ? xs : [...xs, key]));
export const showTag = (kind: TagKind, key: string) =>
  edit('hidden', kind, (xs) => xs.filter((k) => k !== key));

/** Remembers a typed tag for next time (case-insensitive, newest first, at most 12). */
export const rememberTag = (kind: TagKind, text: string) =>
  edit('personal', kind, (xs) =>
    [text, ...xs.filter((x) => x.toLowerCase() !== text.toLowerCase())].slice(0, 12),
  );
export const forgetTag = (kind: TagKind, text: string) =>
  edit('personal', kind, (xs) => xs.filter((x) => x !== text));

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useMyTags(kind: TagKind): { hidden: string[]; personal: string[] } {
  const hidden = useSyncExternalStore(subscribe, () => state.hidden[kind]);
  const personal = useSyncExternalStore(subscribe, () => state.personal[kind]);
  return { hidden, personal };
}
