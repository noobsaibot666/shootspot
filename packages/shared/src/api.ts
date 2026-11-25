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
  /** Community freshness check (Phase 1.5B). */
  lastVerifiedAt: string | null;
  changeFlag: string | null;
}

export const CHANGE_FLAG_REASONS = [
  'construction',
  'access_changed',
  'seasonal',
  'obstructed',
] as const;
export type ChangeFlagReason = (typeof CHANGE_FLAG_REASONS)[number];

export const verifyLocationSchema = z.object({
  status: z.enum(['accurate', 'changed']),
  reason: z.enum(CHANGE_FLAG_REASONS).optional(),
});
export type VerifyLocationInput = z.infer<typeof verifyLocationSchema>;

export const weatherQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});
export type WeatherQuery = z.infer<typeof weatherQuerySchema>;

export interface WeatherDay {
  date: string;
  weatherCode: number;
  summary: string;
  tempMinC: number;
  tempMaxC: number;
  cloudCoverPct: number;
  precipProbPct: number;
  windMaxKmh: number;
  windGustsKmh: number;
}

export interface WeatherForecast {
  days: WeatherDay[];
  source: 'open-meteo';
}

export function describeWmoWeather(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Mixed';
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

export const FOCAL_BANDS = ['wide', 'standard', 'telephoto'] as const;
export type FocalBand = (typeof FOCAL_BANDS)[number];

const boolQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')
  .optional();

export const scoutFilterSchema = z.object({
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
  drone: z.enum(['allowed']).optional(),
  noPermit: boolQuery,
  parking: boolQuery,
  power: boolQuery,
  restrooms: boolQuery,
  easyTerrain: boolQuery,
  tideDependent: boolQuery,
  focalBand: z.enum(FOCAL_BANDS).optional(),
});
export type ScoutFilters = z.infer<typeof scoutFilterSchema>;

export const feedQuerySchema = scoutFilterSchema.extend({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(100).default(10),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

/**
 * Member web gallery (D-44). A location without its exact position: no coordinates, accuracy or
 * distance; the label is the only "where". The exact spot stays in the app. No like state either
 * (the web is read-only).
 */
export type WebRecord = Omit<PublicRecord, 'lat' | 'lon' | 'accuracyM' | 'distanceM' | 'liked'>;

/** Exactly the keys a WebRecord carries; the API builds it from this list and a test checks it. */
export const WEB_RECORD_KEYS = [
  'id',
  'label',
  'framing',
  'goodFor',
  'goodForCustom',
  'goodForNote',
  'bestLight',
  'bestLightCustom',
  'bestLightNote',
  'bearingDeg',
  'advanced',
  'capturedAt',
  'altitudeM',
  'focalLength35mm',
  'sun',
  'images',
  'attribution',
] as const satisfies readonly (keyof WebRecord)[];

export function toWebRecord(r: PublicRecord): WebRecord {
  const out: Record<string, unknown> = {};
  for (const k of WEB_RECORD_KEYS) out[k] = r[k];
  return out as WebRecord;
}

/** Web gallery: newest first, no location search (the web never knows where the viewer is). */
export const webFeedQuerySchema = feedQuerySchema.pick({
  goodFor: true,
  bestLight: true,
  cursor: true,
  limit: true,
});
export type WebFeedQuery = z.infer<typeof webFeedQuerySchema>;

/** Map tab: pins inside the visible bounding box (anonymous, like PublicRecord). */
export const mapQuerySchema = scoutFilterSchema
  .extend({
    minLat: z.coerce.number().min(-90).max(90),
    minLon: z.coerce.number().min(-180).max(180),
    maxLat: z.coerce.number().min(-90).max(90),
    maxLon: z.coerce.number().min(-180).max(180),
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
  /** Self-declared age gate, 18+ (D-41, was 16+ in D-02). Must be literally true. */
  ageConfirmed18: z.literal(true),
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
