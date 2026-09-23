import { describe, it, expect } from 'vitest';
import { historyCsv, CSV_COLUMNS } from '../src/csv.js';
import type { DaySummary } from '../src/moments.js';

const day = (over: Partial<DaySummary> = {}): DaySummary => ({
  date: '2026-09-22',
  edits: 94_000,
  photos: 6_296,
  all_edits: 471_032,
  measured_from: '2026-09-22T00:00:20.000Z',
  new_articles: 15_400,
  new_by_human: 11_100,
  top_articles: [{ title: 'Agra Fort', lang: 'en', url: 'https://x', count: 188 }],
  day_photos: [],
  ...over,
});

/** Minimal RFC 4180 reader, so the test checks the file as a parser would see it. */
function parseRow(line: string): string[] {
  const out: string[] = [];
  let field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

describe('historyCsv', () => {
  it('writes a header and one row per day, oldest first', () => {
    const csv = historyCsv([day({ date: '2026-09-22' }), day({ date: '2026-09-20' })]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[1]).toContain('2026-09-20');
    expect(lines[2]).toContain('2026-09-22');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('leaves the all-Wikipedia cell empty on a day it could not count in full', () => {
    const csv = historyCsv([day({ measured_from: '2026-09-22T16:31:00.000Z' })]);
    const row = csv.trim().split('\n')[1].split(',');
    expect(row[1]).toBe('');       // all_edits withheld rather than reported short
    expect(row[2]).toBe('false');  // and flagged, so nobody has to guess why
    expect(row[3]).toBe('94000');  // located edits survive a restart, so they stay
  });

  it('quotes a place name containing a comma', () => {
    const csv = historyCsv([day({
      top_articles: [{ title: 'Washington, D.C.', lang: 'en', url: 'https://x', count: 42 }],
    })]);
    expect(csv).toContain('"Washington, D.C."');
    // The comma inside the quotes must not become a column boundary.
    const fields = parseRow(csv.trim().split('\n')[1]);
    expect(fields).toHaveLength(CSV_COLUMNS.length);
    expect(fields[CSV_COLUMNS.indexOf('top_place')]).toBe('Washington, D.C.');
  });

  it('escapes a quote inside a title', () => {
    const csv = historyCsv([day({
      top_articles: [{ title: 'The "Blue" Mosque', lang: 'en', url: 'https://x', count: 7 }],
    })]);
    expect(csv).toContain('"The ""Blue"" Mosque"');
    expect(parseRow(csv.trim().split('\n')[1])[CSV_COLUMNS.indexOf('top_place')]).toBe('The "Blue" Mosque');
  });
});
