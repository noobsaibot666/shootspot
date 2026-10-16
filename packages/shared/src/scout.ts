import { z } from 'zod';

/**
 * Scout record data (decision D-16): a short input every record has, plus an optional advanced
 * input. Vocabulary is the Phase 0 proposal in docs/phase-0/02-v1-scope-and-flows.md §3 and will
 * move to admin-managed tags in Phase 2; these lists are the seed values.
 */

export const GOOD_FOR_TAGS = [
  'portrait',
  'fashion',
  'landscape',
  'architecture',
  'street',
  'urban',
  'nature',
  'seascape',
  'night_astro',
  'product',
  'wedding',
  'music_video',
  'narrative_film',
  'commercial',
  'drone',
] as const;

export const BEST_LIGHT_PERIODS = [
  'blue_hour_am',
  'golden_am',
  'morning',
  'midday',
  'afternoon',
  'golden_pm',
  'blue_hour_pm',
  'night',
  'overcast',
] as const;

export const goodForTag = z.enum(GOOD_FOR_TAGS);
export const bestLightPeriod = z.enum(BEST_LIGHT_PERIODS);

const shortText = (max: number) => z.string().trim().max(max);

export const pinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Horizontal accuracy in metres; null when the pin was placed manually. */
  accuracyM: z.number().nonnegative().nullable(),
  source: z.enum(['gps', 'manual', 'search']),
});

export const shortInputSchema = z.object({
  label: shortText(120).min(1),
  goodFor: z.array(goodForTag).min(1).max(8),
  goodForNote: shortText(200).optional(),
  bestLight: z.array(bestLightPeriod).min(1),
  bestLightNote: shortText(200).optional(),
  /** Compass bearing the camera points toward, 0–359. */
  bearingDeg: z.number().min(0).lt(360),
});

const triState = z.enum(['yes', 'no', 'unknown']);

export const advancedInputSchema = z
  .object({
    access: z
      .object({
        type: z.enum(['public', 'permission_needed', 'paid_entry', 'restricted']),
        walkInMinutes: z.number().int().min(0).max(600),
        terrain: z.enum(['easy', 'moderate', 'difficult']),
        accessibilityNote: shortText(200),
      })
      .partial(),
    rules: z
      .object({
        permitRequired: triState,
        drone: z.enum(['allowed', 'restricted', 'no_fly', 'unknown']),
        tripodAllowed: triState,
      })
      .partial(),
    practical: z
      .object({
        parking: triState,
        power: triState,
        shelter: triState,
        restrooms: triState,
        mobileSignal: z.enum(['good', 'weak', 'none', 'unknown']),
      })
      .partial(),
    conditions: z
      .object({
        seasons: z.array(z.enum(['spring', 'summer', 'autumn', 'winter'])),
        crowdNote: shortText(200),
        tideDependent: triState,
        hazardsNote: shortText(300),
      })
      .partial(),
    shot: z
      .object({
        lensUsed: shortText(60),
        focalRangeMm: z.tuple([z.number().positive(), z.number().positive()]),
        note: shortText(500),
      })
      .partial(),
  })
  .partial();

/** Captured automatically on the device; the member may correct time and bearing. */
export const captureMetaSchema = z.object({
  capturedAt: z.iso.datetime({ offset: true }),
  altitudeM: z.number().nullable(),
  focalLength35mm: z.number().positive().nullable(),
  headingDeg: z.number().min(0).lt(360).nullable(),
});

export const draftRecordSchema = z.object({
  /** Client-generated idempotency key; retries of the same draft never create a second record. */
  draftId: z.uuid(),
  framing: z.enum(['16:9', '1:1']),
  pin: pinSchema,
  short: shortInputSchema,
  advanced: advancedInputSchema.optional(),
  capture: captureMetaSchema,
  /** Opt-in public attribution (D-07); off by default. */
  attributed: z.boolean().default(false),
});

export type GoodForTag = z.infer<typeof goodForTag>;
export type BestLightPeriod = z.infer<typeof bestLightPeriod>;
export type Pin = z.infer<typeof pinSchema>;
export type ShortInput = z.infer<typeof shortInputSchema>;
export type AdvancedInput = z.infer<typeof advancedInputSchema>;
export type CaptureMeta = z.infer<typeof captureMetaSchema>;
export type DraftRecord = z.infer<typeof draftRecordSchema>;
