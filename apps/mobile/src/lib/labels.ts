import type { RecordStatus } from '@shootspot/shared';

/** Built-in seed labels; the live, admin-managed lists come from useVocabulary() (D-25). */
export const GOOD_FOR_LABEL: Record<string, string> = {
  portrait: 'Portrait',
  fashion: 'Fashion',
  landscape: 'Landscape',
  architecture: 'Architecture',
  street: 'Street',
  urban: 'Urban',
  nature: 'Nature',
  seascape: 'Seascape',
  night_astro: 'Night / astro',
  product: 'Product',
  wedding: 'Wedding',
  music_video: 'Music video',
  narrative_film: 'Narrative film',
  commercial: 'Commercial',
  drone: 'Drone (where legal)',
  sports: 'Sports',
};

export const BEST_LIGHT_LABEL: Record<string, string> = {
  golden_am: 'Sunrise',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  golden_pm: 'Sunset',
  blue_hour_am: 'Blue hour',
  night: 'Night',
  overcast: 'Overcast-friendly',
};

export const STATUS_LABEL: Record<RecordStatus | 'draft' | 'sending' | 'failed', string> = {
  draft: 'Saved on phone',
  sending: 'Sending…',
  failed: 'Not sent: will retry',
  pending_media: 'Waiting for photo',
  processing: 'Processing',
  published: 'Published',
  rejected: 'Not accepted',
  hidden: 'Hidden by moderation',
  removed: 'Removed',
};

export const REJECT_LABEL: Record<string, string> = {
  portrait: 'The photo is portrait. Only landscape (16:9) or square photos can be published.',
  unsupported_ratio: 'The photo is not 16:9 or square.',
  too_small: 'The photo is too small (at least 1080 px on the short side).',
  too_large: 'The photo is too large.',
  undecodable: 'The photo file could not be read.',
  unsupported_format: 'The photo format is not supported.',
  too_many_bytes: 'The photo file is over 25 MB.',
};
