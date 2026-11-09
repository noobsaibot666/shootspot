/**
 * House numbers come out of location names (D-45): "Am Weinhang 8, Friedrichshain-Kreuzberg"
 * becomes "Am Weinhang, Friedrichshain-Kreuzberg". The street and district say where a spot is
 * roughly; the number would point at one building. The exact pin stays in the app.
 *
 * Works per comma-separated part, so a district or city is never touched:
 * - a trailing number: "Wallstraße 85", "Hauptstr. 12a", "Ring 8-10", "Gasse 3/1", "Rua X 12 B"
 * - a leading number: "221B Baker Street", "10 Downing Street"
 * - a part that is only a number: "Rua Augusta, 24, Lisboa"
 * Kept: numbers inside a name ("Pier 39 Steps" stays, "Haus 2 Café" stays) and postcodes
 * followed by a city ("10115 Berlin" is a postcode, kept).
 */
const NUM = String.raw`\d{1,4}\s?[a-zA-Z]?(?:\s*[-–/]\s*\d{1,4}\s?[a-zA-Z]?)?`;
const TRAILING = new RegExp(String.raw`\s+(?:nº|n\.?º?|no\.?|nr\.?)?\s*${NUM}$`, 'i');
const LEADING = new RegExp(String.raw`^${NUM}\s+(?=\p{L})`, 'u');
const ONLY = new RegExp(String.raw`^(?:nº|n\.?º?|no\.?|nr\.?)?\s*${NUM}$`, 'i');
/** A postcode-and-city part ("10115 Berlin", "1100-148 Lisboa"): not a house number. */
const POSTCODE = /^\d{4,5}(?:-\d{3})?\s+\p{L}/u;

export function withoutHouseNumber(label: string): string {
  const parts = label.split(',').map((p) => p.trim());
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (ONLY.test(part)) continue;
    if (POSTCODE.test(part)) {
      out.push(part);
      continue;
    }
    const cleaned = part.replace(TRAILING, '').replace(LEADING, '').trim();
    out.push(cleaned || part);
  }
  return out.join(', ') || label.trim();
}
