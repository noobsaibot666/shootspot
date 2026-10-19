import type { ImageSet, PublicRecord } from '@shootspot/shared';
import { objectKey } from '@shootspot/shared';
import type { Storage } from '../storage';

/**
 * The single place a location row becomes a public payload. It is an explicit allow-list: no
 * creator id, no created/updated timestamps (upload sequence), no internal state. A test asserts
 * the exact key set.
 */

/** Columns every public query selects (aliases match PublicRow). */
export const PUBLIC_COLUMNS = `
  l.id, l.label, st_y(l.point::geometry) as lat, st_x(l.point::geometry) as lon, l.accuracy_m,
  l.framing, l.good_for, l.good_for_custom, l.good_for_note, l.best_light, l.best_light_custom,
  l.best_light_note, l.bearing_deg,
  l.advanced, l.captured_at, l.altitude_m, l.focal_length_35mm, l.sun_azimuth_deg,
  l.sun_elevation_deg, l.published_at, m.id as media_id, m.width, m.height,
  attr.name as attr_name, attr.portfolio_url as attr_portfolio, attr.social_handle as attr_social`;

/**
 * Whether the viewer liked this location (D-29). Only ever about the viewer: likes are private,
 * so no other member's likes or any count leaves the server. `viewerParam` is the placeholder
 * ($n) holding the viewer's user id.
 */
export const likedColumn = (viewerParam: string) =>
  `exists (select 1 from likes lk where lk.location_id = l.id and lk.user_id = ${viewerParam}) as liked`;

/** Attribution join: only when the record is attributed AND an owner still exists. */
export const ATTRIBUTION_JOIN = `
  left join lateral (
    select coalesce(nullif(p.display_name, ''), trim(p.first_name || ' ' || p.last_name)) as name,
           p.portfolio_url, p.social_handle
    from record_ownership o join profiles p on p.user_id = o.user_id
    where o.location_id = l.id and l.attributed
  ) attr on true`;

export interface PublicRow {
  id: string;
  label: string;
  lat: number;
  lon: number;
  accuracy_m: number | null;
  distance_m?: number | null;
  framing: '16:9' | '1:1';
  good_for: PublicRecord['goodFor'];
  good_for_custom: string[];
  good_for_note: string | null;
  best_light: PublicRecord['bestLight'];
  best_light_custom: string[];
  best_light_note: string | null;
  bearing_deg: number | null;
  advanced: PublicRecord['advanced'];
  captured_at: Date;
  altitude_m: number | null;
  focal_length_35mm: number | null;
  sun_azimuth_deg: number | null;
  sun_elevation_deg: number | null;
  published_at: Date | null;
  media_id: string;
  width: number;
  height: number;
  attr_name: string | null;
  attr_portfolio: string | null;
  attr_social: string | null;
  liked?: boolean;
}

const IMAGE_URL_TTL = 60 * 60;

export async function imageSet(
  storage: Storage,
  row: Pick<PublicRow, 'media_id' | 'width' | 'height'>,
): Promise<ImageSet> {
  const url = (name: string) =>
    storage.presignDownload('public', objectKey.derivative(row.media_id, name), IMAGE_URL_TTL);
  const [thumb, feed, detail] = await Promise.all([url('thumb'), url('feed'), url('detail')]);
  return { thumb, feed, detail, width: row.width, height: row.height };
}

export async function toPublicRecord(storage: Storage, row: PublicRow): Promise<PublicRecord> {
  return {
    id: row.id,
    label: row.label,
    lat: row.lat,
    lon: row.lon,
    accuracyM: row.accuracy_m,
    distanceM: row.distance_m == null ? null : Math.round(row.distance_m),
    framing: row.framing,
    goodFor: row.good_for,
    goodForCustom: row.good_for_custom,
    goodForNote: row.good_for_note,
    bestLight: row.best_light,
    bestLightCustom: row.best_light_custom,
    bestLightNote: row.best_light_note,
    bearingDeg: row.bearing_deg,
    advanced: row.advanced,
    capturedAt: row.captured_at.toISOString(),
    altitudeM: row.altitude_m,
    focalLength35mm: row.focal_length_35mm,
    sun:
      row.sun_azimuth_deg == null || row.sun_elevation_deg == null
        ? null
        : { azimuthDeg: row.sun_azimuth_deg, elevationDeg: row.sun_elevation_deg },
    images: await imageSet(storage, row),
    attribution: row.attr_name
      ? { name: row.attr_name, portfolioUrl: row.attr_portfolio, socialHandle: row.attr_social }
      : null,
    liked: row.liked ?? false,
  };
}
