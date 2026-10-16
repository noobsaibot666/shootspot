/**
 * Reads what an imported gallery photo knows about itself (D-28): where and when it was taken,
 * which way the camera pointed, and the 35 mm focal length. Picker libraries report EXIF in
 * different shapes (Android: flat tags with decimal or rational values; iOS: nested `{GPS}` /
 * `{Exif}` dictionaries), so every lookup tolerates all of them. Anything missing is null.
 */
export interface PhotoMeta {
  capturedAt: string | null;
  gps: { lat: number; lon: number } | null;
  altitudeM: number | null;
  headingDeg: number | null;
  focalLength35mm: number | null;
}

type Dict = Record<string, unknown>;

function sections(exif: Dict): Dict[] {
  const out: Dict[] = [exif];
  for (const k of ['{GPS}', '{Exif}', '{TIFF}', 'GPS', 'Exif', 'TIFF']) {
    const v = exif[k];
    if (v && typeof v === 'object') out.push(v as Dict);
  }
  return out;
}

function pick(exif: Dict, ...keys: string[]): unknown {
  for (const s of sections(exif))
    for (const k of keys) if (s[k] != null && s[k] !== '') return s[k];
  return undefined;
}

/** "52/1" → 52; numbers pass through. */
function rational(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const [n, d] = v.trim().split('/');
  const value = d === undefined ? Number(n) : Number(n) / Number(d);
  return Number.isFinite(value) ? value : null;
}

/** Decimal degrees from a number, "d/1,m/1,s/100", "d m s" or [d, m, s]. */
function degrees(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parts = Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v.split(/[,\s]+/).filter(Boolean)
      : null;
  if (!parts || parts.length === 0) return null;
  const [d, m = 0, s = 0] = parts.map(rational);
  if (d == null || m == null || s == null) return null;
  return d + m / 60 + s / 3600;
}

function signed(value: number | null, ref: unknown, negative: string): number | null {
  if (value == null) return null;
  return typeof ref === 'string' && ref.trim().toUpperCase() === negative
    ? -Math.abs(value)
    : value;
}

/** "2026:05:01 18:42:10" (+ optional "+02:00") → ISO 8601. Without an offset: device local time. */
function timestamp(v: unknown, offset: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  if (typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim())) {
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${offset.trim()}`;
    return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
  }
  const local = new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!);
  return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

export function photoMeta(exif: Dict | null | undefined, now = new Date()): PhotoMeta {
  if (!exif) {
    return {
      capturedAt: null,
      gps: null,
      altitudeM: null,
      headingDeg: null,
      focalLength35mm: null,
    };
  }
  const lat = signed(
    degrees(pick(exif, 'GPSLatitude', 'Latitude')),
    pick(exif, 'GPSLatitudeRef', 'LatitudeRef'),
    'S',
  );
  const lon = signed(
    degrees(pick(exif, 'GPSLongitude', 'Longitude')),
    pick(exif, 'GPSLongitudeRef', 'LongitudeRef'),
    'W',
  );
  const gpsValid =
    lat != null &&
    lon != null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0);

  let capturedAt = timestamp(
    pick(exif, 'DateTimeOriginal', 'DateTimeDigitized', 'DateTime'),
    pick(exif, 'OffsetTimeOriginal', 'OffsetTime'),
  );
  // A capture time in the future (wrong camera clock) is not trusted.
  if (capturedAt && Date.parse(capturedAt) > now.getTime() + 60_000) capturedAt = null;

  const altitude = rational(pick(exif, 'GPSAltitude', 'Altitude'));
  const altRef = pick(exif, 'GPSAltitudeRef', 'AltitudeRef');
  const heading = rational(pick(exif, 'GPSImgDirection', 'ImgDirection'));
  const focal = rational(pick(exif, 'FocalLengthIn35mmFilm', 'FocalLenIn35mmFilm'));

  return {
    capturedAt,
    gps: gpsValid ? { lat: lat!, lon: lon! } : null,
    altitudeM: altitude == null ? null : Number(altRef) === 1 ? -altitude : altitude,
    headingDeg: heading == null || heading < 0 ? null : heading % 360,
    focalLength35mm: focal && focal > 0 ? focal : null,
  };
}
