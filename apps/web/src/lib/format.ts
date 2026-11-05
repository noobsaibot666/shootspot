import { formatBearing, lightAngle, type Vocabulary, type WebRecord } from '@shootspot/shared';

/** The same wording as the app's location screen (apps/mobile/src/app/records/[id].tsx). */
const LIGHT = {
  backlit: 'Backlit',
  side_lit: 'Side-lit',
  front_lit: 'Front-lit',
  sun_down: 'Sun below horizon',
} as const;

/** The short location pill on a tile: the part of the label before the first comma. */
export const shortLabel = (label: string) => label.split(',')[0]!.trim();

export type Labeler = (kind: 'good_for' | 'best_light', key: string) => string;

/** Tag key → admin-managed label; an unknown key reads as words. */
export function labeler(vocabulary: Vocabulary | null): Labeler {
  const map = new Map<string, string>();
  for (const t of vocabulary?.goodFor ?? []) map.set(`good_for:${t.key}`, t.label);
  for (const t of vocabulary?.bestLight ?? []) map.set(`best_light:${t.key}`, t.label);
  return (kind, key) => {
    const found = map.get(`${kind}:${key}`);
    if (found) return found;
    const words = key.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
}

export function goodForTags(r: WebRecord, label: Labeler): string[] {
  return [...r.goodFor.map((g) => label('good_for', g)), ...(r.goodForCustom ?? [])];
}

export function bestLightText(r: WebRecord, label: Labeler): string {
  return [...r.bestLight.map((b) => label('best_light', b)), ...(r.bestLightCustom ?? [])].join(
    ', ',
  );
}

export interface Fact {
  title: string;
  value: string;
  sub?: string;
}

/** Light & direction, as the app shows it. */
export function lightFacts(r: WebRecord, label: Labeler, locale?: string): Fact[] {
  const facts: Fact[] = [];
  const best = bestLightText(r, label);
  if (best || r.bestLightNote) {
    facts.push({ title: 'Best light', value: best || '—', sub: r.bestLightNote ?? undefined });
  }
  facts.push({
    title: 'Camera faces',
    value: r.bearingDeg == null ? 'Unknown' : formatBearing(r.bearingDeg),
    sub:
      r.sun && r.bearingDeg != null
        ? `${LIGHT[lightAngle(r.bearingDeg, r.sun)]} at capture`
        : undefined,
  });
  if (r.sun) {
    const el = Math.round(r.sun.elevationDeg);
    facts.push({
      title: 'Sun at capture',
      value: el >= 0 ? `${el}° above the horizon` : `${-el}° below the horizon`,
      sub: `From the ${formatBearing(r.sun.azimuthDeg).split(' ')[1]} · ${Math.round(r.sun.azimuthDeg)}°`,
    });
  }
  const at = new Date(r.capturedAt);
  facts.push({
    title: 'Captured',
    value: at.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    sub: at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
  });
  return facts;
}

/** Access & practical, only the answered rows (same list as the app). */
export function practicalFacts(r: WebRecord): [string, string][] {
  const adv = r.advanced;
  const rows: [string, string | undefined][] = [
    ['Access', adv.access?.type?.replace('_', ' ')],
    [
      'Walk from parking',
      adv.access?.walkInMinutes != null ? `${adv.access.walkInMinutes} min` : undefined,
    ],
    ['Terrain', adv.access?.terrain],
    ['Permit required', adv.rules?.permitRequired],
    ['Drones', adv.rules?.drone?.replace('_', '-')],
    ['Tripod allowed', adv.rules?.tripodAllowed],
    ['Parking', adv.practical?.parking],
    ['Mobile signal', adv.practical?.mobileSignal],
    ['Tide-dependent', adv.conditions?.tideDependent],
    ['Hazards', adv.conditions?.hazardsNote],
    ['Lens', adv.shot?.lensUsed],
    ['Notes', adv.shot?.note],
  ];
  if (r.focalLength35mm)
    rows.push(['Focal length', `${Math.round(r.focalLength35mm)} mm (35 mm eq.)`]);
  if (r.altitudeM != null) rows.push(['Altitude', `${Math.round(r.altitudeM)} m`]);
  // Answers are stored lower-case ("not-allowed"): capitalise the first letter only.
  return rows
    .filter((f): f is [string, string] => Boolean(f[1]))
    .map(([k, v]) => [k, v.charAt(0).toUpperCase() + v.slice(1)]);
}

/**
 * Masonry: each item goes to the currently shortest column, in feed order, so newest stays
 * top-left and appending a page never moves tiles already placed.
 */
export function distribute<T extends { images: { width: number; height: number } }>(
  items: T[],
  columns: number,
): T[][] {
  const cols: T[][] = Array.from({ length: Math.max(1, columns) }, () => []);
  const heights = cols.map(() => 0);
  for (const it of items) {
    const aspect = it.images.width / it.images.height;
    const h = Number.isFinite(aspect) && aspect > 0 ? 1 / aspect : 9 / 16;
    const i = heights.indexOf(Math.min(...heights));
    cols[i]!.push(it);
    heights[i]! += h;
  }
  return cols;
}
