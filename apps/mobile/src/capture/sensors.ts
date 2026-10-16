import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

export interface FieldFix {
  lat: number;
  lon: number;
  accuracyM: number | null;
  altitudeM: number | null;
  at: number;
}

export interface FieldSensors {
  permission: 'unknown' | 'granted' | 'denied';
  fix: FieldFix | null;
  /** True-north heading reported by the OS; the spike checks whether it tracks the back camera. */
  headingDeg: number | null;
  headingAccuracy: number | null;
  request(): Promise<void>;
}

/**
 * Location + heading while the camera is open. Permission is requested in context (only when the
 * camera opens) and denial is not fatal: the member can place the pin manually (D-15).
 */
export function useFieldSensors(active: boolean): FieldSensors {
  const [permission, setPermission] = useState<FieldSensors['permission']>('unknown');
  const [fix, setFix] = useState<FieldFix | null>(null);
  const [heading, setHeading] = useState<{ deg: number; accuracy: number } | null>(null);
  const requested = useRef(false);

  const request = async () => {
    requested.current = true;
    const res = await Location.requestForegroundPermissionsAsync();
    setPermission(res.granted ? 'granted' : 'denied');
  };

  useEffect(() => {
    if (active && !requested.current) void request();
  }, [active]);

  useEffect(() => {
    if (!active || permission !== 'granted') return;
    const subs: Location.LocationSubscription[] = [];
    let cancelled = false;

    void (async () => {
      const pos = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        ({ coords, timestamp }) =>
          setFix({
            lat: coords.latitude,
            lon: coords.longitude,
            accuracyM: coords.accuracy,
            altitudeM: coords.altitude,
            at: timestamp,
          }),
      );
      const head = await Location.watchHeadingAsync((h) =>
        setHeading({
          deg: h.trueHeading >= 0 ? h.trueHeading : h.magHeading,
          accuracy: h.accuracy,
        }),
      );
      if (cancelled) {
        pos.remove();
        head.remove();
      } else {
        subs.push(pos, head);
      }
    })();

    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove());
    };
  }, [active, permission]);

  return {
    permission,
    fix,
    headingDeg: heading?.deg ?? null,
    headingAccuracy: heading?.accuracy ?? null,
    request,
  };
}
