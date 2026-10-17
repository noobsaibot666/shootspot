import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { haptics } from './device';

/**
 * Private likes (D-29). One in-memory source of truth for "did I like this", so a heart tapped in
 * the feed is already filled on the detail page and in Profile → Liked. Updates are optimistic:
 * the heart changes at once and reverts if the server refuses.
 */
const state = new Map<string, boolean>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Seed from server data (feed/detail/list responses) without overriding a pending local change. */
export function seedLiked(items: { id: string; liked: boolean }[]) {
  let changed = false;
  for (const it of items) {
    if (state.get(it.id) !== it.liked) {
      state.set(it.id, it.liked);
      changed = true;
    }
  }
  if (changed) notify();
}

export async function setLiked(id: string, liked: boolean) {
  const before = state.get(id) ?? false;
  if (before === liked) return;
  state.set(id, liked);
  notify();
  haptics.selection();
  try {
    await api(`/v1/records/${id}/like`, { method: liked ? 'PUT' : 'DELETE' });
  } catch {
    state.set(id, before);
    notify();
  }
}

/** Current state for one record (undefined when this session never saw it). */
export function isLiked(id: string): boolean | undefined {
  return state.get(id);
}

export function subscribeLikes(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current like state of one record, kept in sync everywhere. */
export function useLiked(id: string, initial?: boolean): [boolean, () => void] {
  const read = () => state.get(id) ?? initial ?? false;
  const [liked, setState] = useState(read);
  useEffect(() => {
    setState(read());
    return subscribeLikes(() => setState(read()));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback(
    () => void setLiked(id, !(state.get(id) ?? initial ?? false)),
    [id, initial],
  );
  return [liked, toggle];
}
