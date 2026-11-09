import { describe, expect, it } from 'vitest';
import { withoutHouseNumber } from './address';

describe('withoutHouseNumber (D-45)', () => {
  it.each([
    ['Am Weinhang 8, Friedrichshain-Kreuzberg', 'Am Weinhang, Friedrichshain-Kreuzberg'],
    ['Wallstraße 85', 'Wallstraße'],
    ['Hauptstr. 12a, Mitte', 'Hauptstr., Mitte'],
    ['Ring 8-10, Köln', 'Ring, Köln'],
    ['Gasse 3/1', 'Gasse'],
    ['Rua Augusta 24 B, Lisboa', 'Rua Augusta, Lisboa'],
    ['Rua Augusta, 24, Lisboa', 'Rua Augusta, Lisboa'],
    ['Rua Augusta, nº 24, Lisboa', 'Rua Augusta, Lisboa'],
    ['221B Baker Street, London', 'Baker Street, London'],
    ['10 Downing Street', 'Downing Street'],
  ])('%s → %s', (input, want) => {
    expect(withoutHouseNumber(input)).toBe(want);
  });

  it.each([
    'Concrete stairs, Berlin',
    'Miradouro da Graça',
    'Pier 39 Steps, San Francisco',
    'Haus 2 Café, Leipzig',
    'Torstraße, 10115 Berlin',
    'Rua do Ouro, 1100-148 Lisboa',
  ])('keeps %s', (input) => {
    expect(withoutHouseNumber(input)).toBe(input);
  });

  it('never returns an empty label', () => {
    expect(withoutHouseNumber('12')).toBe('12');
  });
});

describe('notes schema (D-45)', () => {
  it('removes the house number when a label is saved', async () => {
    const { notesFields } = await import('./scout');
    const parsed = notesFields.shape.label.parse('Am Weinhang 8, Friedrichshain-Kreuzberg');
    expect(parsed).toBe('Am Weinhang, Friedrichshain-Kreuzberg');
  });
});
