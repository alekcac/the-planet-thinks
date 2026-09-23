import type { DaySummary } from './moments.js';
import { complete } from './facts.js';

// The daily history as a file somebody can open, cite and archive.
//
// JSON behind an API is fine for a page that renders it, and useless for the places that
// give a dataset a life of its own: Zenodo hands out a DOI, Kaggle indexes columns,
// Google Dataset Search reads the schema — and all of them expect a file. This site has
// been measuring something nobody else publishes daily, so it should be downloadable
// rather than only queryable.

export const CSV_COLUMNS = [
  'date',
  'all_edits',
  'all_edits_complete',
  'located_edits',
  'new_articles',
  'new_articles_by_people',
  'geotagged_photos',
  'top_place',
  'top_place_lang',
  'top_place_edits',
] as const;

/** RFC 4180: quote anything holding a comma, a quote or a newline; double inner quotes. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function historyCsv(days: DaySummary[]): string {
  const rows = [CSV_COLUMNS.join(',')];
  // Oldest first: a time series is read forwards, and spreadsheets chart it that way.
  for (const d of [...days].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const top = d.top_articles[0];
    rows.push([
      cell(d.date),
      // A day counted from halfway through holds a number that is simply wrong, so the
      // cell is left empty rather than filled with something a reader would average.
      cell(complete(d) ? d.all_edits : ''),
      cell(complete(d) ? 'true' : 'false'),
      cell(d.edits),
      cell(d.new_articles ?? ''),
      cell(d.new_by_human ?? ''),
      cell(d.photos),
      cell(top?.title ?? ''),
      cell(top?.lang ?? ''),
      cell(top?.count ?? ''),
    ].join(','));
  }
  return rows.join('\n') + '\n';
}
