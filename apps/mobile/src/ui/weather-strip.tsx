import type { WeatherDay, WeatherForecast } from '@shootspot/shared';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { font, radius, space, type, useTheme } from '../theme/tokens';
import { Icon } from './icon';
import { Mono, Row } from './index';

function toLocalYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDayName(ymd: string, index: number): string {
  if (index === 0) return 'Today';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * 7-day shoot weather & wind forecast (Phase 1.5C) powered by Open-Meteo via `/v1/weather`.
 * Fails silently when offline so it never blocks Location Detail.
 */
export function WeatherStrip(props: {
  lat: number;
  lon: number;
  selectedTime: Date;
  onSelectDay?(date: Date): void;
  showDroneHint?: boolean;
}) {
  const t = useTheme();
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);

  useEffect(() => {
    let alive = true;
    void api<WeatherForecast>(`/v1/weather?lat=${props.lat}&lon=${props.lon}`)
      .then((res) => {
        if (alive) setForecast(res);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [props.lat, props.lon]);

  if (!forecast?.days.length) return null;

  const selectedYmd = toLocalYmd(props.selectedTime);
  const activeDay: WeatherDay =
    forecast.days.find((d) => d.date === selectedYmd) ?? forecast.days[0]!;
  const gusty = activeDay.windMaxKmh >= 35 || activeDay.windGustsKmh >= 45;

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.md,
      }}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: space.xs }}>
          <Icon name="globe" size={16} color={t.muted} />
          <Text style={[type.headline, { color: t.ink }]}>7-day shoot weather</Text>
        </Row>
        <Text style={[type.caption, { color: t.muted }]}>{activeDay.summary}</Text>
      </Row>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm }}
      >
        {forecast.days.map((day, idx) => {
          const active = day.date === activeDay.date;
          return (
            <Pressable
              key={day.date}
              accessibilityRole="button"
              onPress={() => {
                if (!props.onSelectDay) return;
                const [y, m, d] = day.date.split('-').map(Number);
                if (!y || !m || !d) return;
                const next = new Date(props.selectedTime);
                next.setFullYear(y, m - 1, d);
                props.onSelectDay(next);
              }}
              style={{
                minWidth: 76,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: radius.control,
                backgroundColor: active ? t.ink : t.raised,
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Text
                style={[
                  type.caption,
                  { color: active ? t.onInk : t.muted, fontWeight: '600', fontSize: 11 },
                ]}
              >
                {formatDayName(day.date, idx)}
              </Text>
              <Mono
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: active ? t.onInk : t.ink,
                }}
              >
                {day.tempMaxC}° / {day.tempMinC}°
              </Mono>
              <Text
                style={[
                  type.caption,
                  { color: active ? t.onInk : t.muted, fontSize: 10, fontFamily: font.mono },
                ]}
              >
                ☁ {day.cloudCoverPct}% · ☂ {day.precipProbPct}%
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm }}>
        <Text style={[type.caption, { color: t.muted, fontFamily: font.mono }]}>
          Wind {activeDay.windMaxKmh} km/h (gusts {activeDay.windGustsKmh} km/h)
        </Text>
        <Text style={[type.caption, { color: t.muted }]}>
          {activeDay.cloudCoverPct <= 25
            ? 'Clear sky · crisp shadows'
            : activeDay.cloudCoverPct >= 75
              ? 'Heavy cloud · soft light'
              : 'Broken cloud · dramatic light'}
        </Text>
      </Row>

      {props.showDroneHint && gusty ? (
        <View
          style={{
            backgroundColor: t.raised,
            borderRadius: radius.control,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.xs,
          }}
        >
          <Icon name="alert" size={14} color={t.accent} />
          <Text style={[type.caption, { color: t.accent, fontWeight: '600', flex: 1 }]}>
            High wind / gusts forecast — check drone limits before flying.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
