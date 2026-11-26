import { distanceMeters } from './geo';
import { daylightSummary, lightAngle, sunAtCapture } from './sun';

export interface SequencerSpot {
  id: string;
  lat: number;
  lon: number;
  bestLight: readonly string[];
  bearingDeg: number | null;
}

export interface SequencedStop {
  id: string;
  windowLabel: string;
  timeMs: number;
  conflict: string | null;
}

export interface SequencerResult {
  orderedIds: string[];
  totalDistanceM: number;
  stops: SequencedStop[];
}

function fmtShortTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function spotBestWindow(spot: SequencerSpot, date: Date): { label: string; timeMs: number } {
  const s = daylightSummary(date, spot.lat, spot.lon);
  const periods = spot.bestLight;
  const pick = (label: string, at: Date | null | undefined, fallbackHour: number) => {
    const t =
      at && !Number.isNaN(at.getTime())
        ? at
        : new Date(date.getFullYear(), date.getMonth(), date.getDate(), fallbackHour, 0);
    return { label, timeMs: t.getTime(), date: t };
  };

  let chosen = pick('Golden PM', s.goldenHour, 18);
  if (periods.includes('blue_hour_am')) chosen = pick('Blue AM', s.dawn, 5);
  else if (periods.includes('golden_am')) chosen = pick('Golden AM', s.sunrise, 6);
  else if (periods.includes('morning'))
    chosen = pick('Morning', s.sunrise ? new Date(s.sunrise.getTime() + 2 * 3_600_000) : null, 9);
  else if (periods.includes('midday')) chosen = pick('Midday', s.solarNoon, 12);
  else if (periods.includes('afternoon'))
    chosen = pick('Afternoon', new Date(s.solarNoon.getTime() + 2.5 * 3_600_000), 15);
  else if (periods.includes('golden_pm')) chosen = pick('Golden PM', s.goldenHour, 18);
  else if (periods.includes('night')) chosen = pick('Night', s.dusk, 21);

  const sun = sunAtCapture(chosen.date, spot.lat, spot.lon);
  const angle = spot.bearingDeg != null ? lightAngle(spot.bearingDeg, sun).replace('_', '-') : null;
  return {
    label: `${chosen.label} ${fmtShortTime(chosen.date)}${angle && angle !== 'sun-down' ? ` · ${angle}` : ''}`,
    timeMs: chosen.timeMs,
  };
}

/**
 * Sequences a shoot day chronologically by each spot's optimal light window while breaking ties
 * within 45 minutes by nearest straight-line travel distance, and flagging tight cross-city jumps.
 */
export function autoSequenceShootDay(spots: SequencerSpot[], date: Date): SequencerResult {
  if (!spots.length) return { orderedIds: [], totalDistanceM: 0, stops: [] };

  const remaining = spots.map((spot) => ({
    spot,
    win: spotBestWindow(spot, date),
  }));

  const ordered: typeof remaining = [];
  while (remaining.length > 0) {
    // Find earliest light window among remaining stops
    const minTime = Math.min(...remaining.map((r) => r.win.timeMs));
    // Candidates within 45 min of the earliest window
    const candidates = remaining.filter((r) => r.win.timeMs - minTime <= 45 * 60_000);
    const prev = ordered.at(-1)?.spot;

    let best = candidates[0]!;
    if (prev && candidates.length > 1) {
      let bestDist = Infinity;
      for (const c of candidates) {
        const d = distanceMeters(prev.lat, prev.lon, c.spot.lat, c.spot.lon);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
    }

    ordered.push(best);
    const idx = remaining.indexOf(best);
    remaining.splice(idx, 1);
  }

  let totalDistanceM = 0;
  const stops: SequencedStop[] = ordered.map((entry, i) => {
    let conflict: string | null = null;
    if (i > 0) {
      const prev = ordered[i - 1]!;
      const dist = distanceMeters(prev.spot.lat, prev.spot.lon, entry.spot.lat, entry.spot.lon);
      totalDistanceM += dist;
      const gapMin = Math.abs(entry.win.timeMs - prev.win.timeMs) / 60_000;
      if (gapMin <= 45 && dist > 15_000) {
        conflict = `Tight window · ${Math.round(dist / 1000)} km from prev stop`;
      }
    }
    return {
      id: entry.spot.id,
      windowLabel: entry.win.label,
      timeMs: entry.win.timeMs,
      conflict,
    };
  });

  return {
    orderedIds: ordered.map((o) => o.spot.id),
    totalDistanceM: Math.round(totalDistanceM),
    stops,
  };
}
