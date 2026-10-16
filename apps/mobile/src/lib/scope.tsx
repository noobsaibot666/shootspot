import type { BestLightPeriod, GoodForTag } from '@shootspot/shared';
import { File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * What the Feed and Map show (plan journey 2): nearby (device location, only when the member
 * chose it and granted permission) or a chosen place, a radius, and filters. Persisted so the
 * scope survives restarts; the active scope is always shown on screen.
 */
export interface Scope {
  mode: 'nearby' | 'place' | 'everywhere';
  place: { lat: number; lon: number; label: string } | null;
  radiusKm: number;
  goodFor: GoodForTag[];
  bestLight: BestLightPeriod[];
}

export const RADII = [1, 5, 10, 25, 50, 100] as const;
const DEFAULT: Scope = {
  mode: 'everywhere',
  place: null,
  radiusKm: 10,
  goodFor: [],
  bestLight: [],
};
const file = () => new File(Paths.document, 'scope.json');

interface ScopeCtx {
  scope: Scope;
  /** Where "nearby" currently is, when known. */
  here: { lat: number; lon: number } | null;
  locationDenied: boolean;
  setScope(next: Partial<Scope>): void;
  /** Resolves the centre to query around, or null for "everywhere". */
  center: { lat: number; lon: number } | null;
  refreshHere(): Promise<void>;
}

const Ctx = createContext<ScopeCtx | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setState] = useState<Scope>(DEFAULT);
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [locationDenied, setDenied] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const f = file();
        if (f.exists) setState({ ...DEFAULT, ...(JSON.parse(await f.text()) as Partial<Scope>) });
      } catch {}
    })();
  }, []);

  const setScope = useCallback((next: Partial<Scope>) => {
    setState((s) => {
      const merged = { ...s, ...next };
      try {
        const f = file();
        if (!f.exists) f.create({ overwrite: true });
        void f.write(JSON.stringify(merged));
      } catch {}
      return merged;
    });
  }, []);

  // Location is asked for in context: only when the member picks "Nearby".
  const refreshHere = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    const last = await Location.getLastKnownPositionAsync();
    if (last) setHere({ lat: last.coords.latitude, lon: last.coords.longitude });
    const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setHere({ lat: now.coords.latitude, lon: now.coords.longitude });
  }, []);

  useEffect(() => {
    if (scope.mode === 'nearby') void refreshHere().catch(() => setDenied(true));
  }, [scope.mode, refreshHere]);

  const center =
    scope.mode === 'nearby' ? here : scope.mode === 'place' && scope.place ? scope.place : null;

  const value = useMemo<ScopeCtx>(
    () => ({ scope, here, locationDenied, setScope, center, refreshHere }),
    [scope, here, locationDenied, setScope, center, refreshHere],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScope(): ScopeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useScope outside ScopeProvider');
  return c;
}

export function scopeLabel(scope: Scope, located: boolean): string {
  const filters = scope.goodFor.length + scope.bestLight.length;
  const where =
    scope.mode === 'nearby'
      ? located
        ? `Nearby · ${scope.radiusKm} km`
        : 'Nearby · locating…'
      : scope.mode === 'place' && scope.place
        ? `${scope.place.label} · ${scope.radiusKm} km`
        : 'Everywhere';
  return filters ? `${where} · ${filters} filter${filters > 1 ? 's' : ''}` : where;
}

/** Query string for /v1/feed and /v1/map filters. */
export function filterQuery(scope: Scope): string {
  const q: string[] = [];
  if (scope.goodFor.length) q.push(`goodFor=${scope.goodFor.join(',')}`);
  if (scope.bestLight.length) q.push(`bestLight=${scope.bestLight.join(',')}`);
  return q.join('&');
}
