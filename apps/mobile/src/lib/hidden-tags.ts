import type { TagKind } from '@shootspot/shared';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

/**
 * Tags a member hid from their own pickers (D-38): someone who only shoots sports doesn't need
 * "Wedding" in the way. Personal and on this phone only; the admin-managed lists (D-25) are
 * unchanged, and "Add" brings a hidden tag back.
 */
type Hidden = Record<TagKind, string[]>;

const file = () => new File(Paths.document, 'hidden-tags.json');
let hidden: Hidden = { good_for: [], best_light: [] };
const listeners = new Set<() => void>();

try {
  const f = file();
  if (f.exists) hidden = { ...hidden, ...(JSON.parse(f.textSync()) as Partial<Hidden>) };
} catch {}

function set(next: Hidden) {
  hidden = next;
  listeners.forEach((l) => l());
  try {
    const f = file();
    if (!f.exists) f.create({ overwrite: true });
    void f.write(JSON.stringify(next)).catch(() => {});
  } catch {}
}

export function hideTag(kind: TagKind, key: string) {
  if (!hidden[kind].includes(key)) set({ ...hidden, [kind]: [...hidden[kind], key] });
}

export function showTag(kind: TagKind, key: string) {
  set({ ...hidden, [kind]: hidden[kind].filter((k) => k !== key) });
}

export function useHiddenTags(kind: TagKind): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hidden[kind],
  );
}
