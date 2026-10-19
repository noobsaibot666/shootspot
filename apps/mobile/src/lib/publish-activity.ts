import type { RecordStatusResponse } from '@shootspot/shared';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { api } from './api';
import type { LocalDraft } from './drafts';

/**
 * iOS only: publish progress as a Live Activity (Dynamic Island, Lock Screen). Native side:
 * modules/publish-activity (start/update/end) and targets/widget/PublishActivity.swift (views).
 *
 * Follows the draft states from lib/drafts.ts for photos taken with the in-app camera (not
 * gallery imports, which come in batches). After the upload the server processes the photo, so
 * this checks the record's status until it is live or rejected. Missing native module (Android,
 * Expo Go, older builds): every call is a no-op.
 */

type Phase = 'sending' | 'processing' | 'live' | 'rejected' | 'waiting';

interface PublishActivityNative {
  sync(
    draftId: string,
    title: string,
    phase: Phase,
    recordId: string | null,
    photoUri: string | null,
  ): Promise<void>;
}

const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<PublishActivityNative>('PublishActivity')
    : null;

const POLL_MS = 3000;
const POLL_TRIES = 40;
const polling = new Set<string>();

function sync(d: LocalDraft, phase: Phase, photoUri: string | null = null) {
  void native
    ?.sync(d.draft.draftId, d.draft.short.label, phase, d.recordId, photoUri)
    .catch(() => {});
}

/** Called by lib/drafts.ts whenever a draft's state is saved. */
export function trackPublish(d: LocalDraft, photoUri: string) {
  if (!native || d.draft.capture.origin !== 'camera') return;
  switch (d.state) {
    case 'creating':
    case 'uploading':
    case 'confirming':
      sync(d, 'sending', photoUri);
      return;
    case 'failed':
      sync(d, 'waiting');
      return;
    case 'processing':
      sync(d, 'processing', photoUri);
      void watch(d);
      return;
    case 'done':
      // Settled by resumeDrafts (e.g. after a restart): one more look ends the activity.
      void watch(d);
      return;
  }
}

/** Polls the record until the server has finished with it, then ends the activity. */
async function watch(d: LocalDraft) {
  const id = d.draft.draftId;
  if (!d.recordId || polling.has(id)) return;
  polling.add(id);
  try {
    for (let i = 0; i < POLL_TRIES; i++) {
      try {
        const s = await api<RecordStatusResponse>(`/v1/records/${d.recordId}/status`);
        if (s.status === 'published') return sync(d, 'live');
        if (s.status === 'rejected' || s.status === 'hidden' || s.status === 'removed')
          return sync(d, 'rejected');
      } catch {}
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    // Still processing: the activity stays and turns stale on its own; the next app start retries.
  } finally {
    polling.delete(id);
  }
}
