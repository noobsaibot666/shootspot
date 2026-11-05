import type { WebRecord } from '@shootspot/shared';
import { describe, expect, it } from 'vitest';
import { distribute, labeler, lightFacts, practicalFacts, shortLabel } from './format';

const record = (over: Partial<WebRecord> = {}): WebRecord =>
  ({
    id: '00000000-0000-4000-8000-000000000001',
    label: 'Miradouro da Graça, Lisbon',
    framing: '16:9',
    goodFor: ['landscape'],
    goodForCustom: ['rooftops'],
    goodForNote: null,
    bestLight: ['golden_pm'],
    bestLightCustom: [],
    bestLightNote: null,
    bearingDeg: 247,
    advanced: { access: { type: 'public', walkInMinutes: 5 }, rules: { drone: 'not_allowed' } },
    capturedAt: '2026-10-15T18:30:00.000Z',
    altitudeM: null,
    focalLength35mm: 24,
    sun: { azimuthDeg: 250, elevationDeg: 4 },
    images: { thumb: 't', feed: 'f', detail: 'd', width: 1920, height: 1080 },
    attribution: null,
    ...over,
  }) as WebRecord;

describe('format', () => {
  it('shortens the label and names tags', () => {
    expect(shortLabel('Miradouro da Graça, Lisbon')).toBe('Miradouro da Graça');
    const l = labeler({ goodFor: [{ key: 'landscape', label: 'Landscape' }], bestLight: [] });
    expect(l('good_for', 'landscape')).toBe('Landscape');
    expect(l('best_light', 'golden_pm')).toBe('Golden pm');
  });

  it('describes light and direction like the app', () => {
    const facts = lightFacts(record(), labeler(null), 'en-GB');
    expect(facts.map((f) => f.title)).toEqual([
      'Best light',
      'Camera faces',
      'Sun at capture',
      'Captured',
    ]);
    expect(facts[1]!.sub).toBe('Backlit at capture');
    expect(facts[2]!.value).toBe('4° above the horizon');
  });

  it('lists only answered practical rows', () => {
    expect(practicalFacts(record())).toEqual([
      ['Access', 'Public'],
      ['Walk from parking', '5 min'],
      ['Drones', 'Not-allowed'],
      ['Focal length', '24 mm (35 mm eq.)'],
    ]);
  });

  it('places tiles in the shortest column and keeps earlier tiles put when a page is added', () => {
    const wide = { images: { width: 1600, height: 900 } };
    const square = { images: { width: 1000, height: 1000 } };
    const first = [square, wide, wide, wide];
    const cols = distribute(first, 2);
    expect(cols[0]).toEqual([square, wide]);
    expect(cols[1]).toEqual([wide, wide]);
    const more = distribute([...first, square], 2);
    expect(more[0]!.slice(0, 2)).toEqual(cols[0]);
    expect(more[1]!.slice(0, 2)).toEqual(cols[1]);
  });
});
