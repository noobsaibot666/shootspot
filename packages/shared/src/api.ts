import { z } from 'zod';
import type { AdvancedInput, BestLightPeriod, GoodForTag } from './scout';
import { advancedInputSchema, bestLightPeriod, goodForTag, hasTags, notesFields } from './scout';

/**
 * API contract shared by the API and the clients. `PublicRecord` is the anonymity contract
 * (D-06): it has no creator identifier of any kind, and `attribution` is present only when the
 * creator opted in (D-07).
 */

export interface ImageSet {
  thumb: string;
  feed: string;
  detail: string;
  width: number;
  height: number;
}

export interface Attribution {
  name: string;
  portfolioUrl: string | null;
  socialHandle: string | null;
}

export interface PublicRecord {
  id: string;
  label: string;
  lat: number;
  lon: number;
  accuracyM: number | null;
  distanceM: number | null;
  framing: '16:9' | '1:1';
  goodFor: GoodForTag[];
  /** The creator's own tags (D-39), shown as written. */
  goodForCustom: string[];
  goodForNote: string | null;
  bestLight: BestLightPeriod[];
  bestLightCustom: string[];
  bestLightNote: string | null;
  bearingDeg: number | null;
  advanced: AdvancedInput;
  capturedAt: string;
  altitudeM: number | null;
  focalLength35mm: number | null;
  sun: { azimuthDeg: number; elevationDeg: number } | null;
  images: ImageSet;
  attribution: Attribution | null;
  /** The viewer's own like (D-29). Private: never about other members, no counts. */
  liked: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type RecordStatus =
  'pending_media' | 'processing' | 'published' | 'rejected' | 'hidden' | 'removed';
export type MediaState =
  'awaiting_upload' | 'queued' | 'processing' | 'ready' | 'rejected' | 'failed' | 'purged';

export interface CreateRecordResponse {
  recordId: string;
  status: RecordStatus;
  media: { id: string; state: MediaState };
  /** Present while the original still has to be uploaded. PUT the JPEG bytes with these headers. */
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string } | null;
}

export interface RecordStatusResponse {
  recordId: string;
  status: RecordStatus;
  media: { state: MediaState; rejectReason: string | null };
}

export const LEGAL_KINDS = ['terms', 'privacy', 'image_license'] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export const feedQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(100).default(10),
  goodFor: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(goodForTag))
    .optional(),
  bestLight: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(bestLightPeriod))
    .optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

/** Map tab: pins inside the visible bounding box (anonymous, like PublicRecord). */
export const mapQuerySchema = z
  .object({
    minLat: z.coerce.number().min(-90).max(90),
    minLon: z.coerce.number().min(-180).max(180),
    maxLat: z.coerce.number().min(-90).max(90),
    maxLon: z.coerce.number().min(-180).max(180),
    goodFor: feedQuerySchema.shape.goodFor,
    bestLight: feedQuerySchema.shape.bestLight,
  })
  .refine((q) => q.minLat < q.maxLat && q.minLon < q.maxLon, 'empty box');
export type MapQuery = z.infer<typeof mapQuerySchema>;

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  label: string;
  thumb: string;
}

/** Upper bound of pins per map request; the client clusters them. */
export const MAP_PIN_LIMIT = 300;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** "example.com/me" → "https://example.com/me"; blank → null. Links don't need a typed scheme. */
export function normalizeWebUrl(input: string | null | undefined): string | null {
  const s = input?.trim();
  if (!s) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}

export const profileUpdateSchema = z.object({
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  displayName: optionalText(60),
  bio: optionalText(300),
  portfolioUrl: z
    .preprocess(
      (v) => (typeof v === 'string' ? normalizeWebUrl(v) : v),
      z
        .url({ protocol: /^https?$/ })
        .max(300)
        .nullable(),
    )
    .optional(),
  socialHandle: optionalText(60),
});

export const onboardingSchema = z.object({
  /** Self-declared age gate (D-02). Must be literally true. */
  ageConfirmed16: z.literal(true),
  accept: z.object({ terms: z.string(), privacy: z.string(), image_license: z.string() }),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).default(''),
});

export const REPORT_REASONS = [
  'private_property',
  'unsafe_access',
  'wrong_location',
  'inappropriate_image',
  'copyright',
  'person_identifiable',
  'spam_duplicate',
  'other',
] as const;

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(500).optional(),
});

export const projectCreateSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
});

export const attributionUpdateSchema = z.object({
  attributed: z.boolean(),
  /** Required when turning attribution on: the responsibility notice version the member accepted. */
  noticeVersion: z.string().optional(),
});

/** The creator edits the scouting notes of a published record; location, direction and photo stay. */
export const recordNotesUpdateSchema = notesFields
  .extend({ advanced: advancedInputSchema.default({}) })
  .refine(hasTags, { path: ['goodFor'], message: 'needs a Good for and a Best light tag' });
export type RecordNotesUpdate = z.input<typeof recordNotesUpdateSchema>;
