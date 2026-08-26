// Turning somebody else's data into pulses, entirely in their browser.
//
// The globe already knows how to draw a Pulse, so everything here is translation:
// a CSV row, a GeoJSON feature, or one JSON object off a live stream, mapped onto
// the same shape the Wikipedia feed produces. Nothing is uploaded, nothing is
// stored — the file never leaves the page it was dropped on.
//
// `lang` is not a language here: the globe derives a hue by hashing that string,
// so whatever the data calls its categories becomes the colour key for free.

import type { Pulse } from './types';

/** Above this a browser starts to stutter, and a globe stops being readable anyway. */
export const MAX_POINTS = 5000;

export interface ParseResult {
  points: Pulse[];
  /** Rows that named a location we could not read. */
  skipped: number;
  /** Set when nothing could be read at all. */
  error?: string;
}

const isLat = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
const isLon = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  // Accept the comma decimal separator, but only when it is unambiguous.
  const t = v.trim().replace(',', '.');
  if (!t || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const LAT_KEYS = ['lat', 'latitude', 'y'];
const LON_KEYS = ['lon', 'lng', 'long', 'longitude', 'x'];
const TITLE_KEYS = ['title', 'name', 'label', 'place', 'city', 'description'];
const CATEGORY_KEYS = ['category', 'type', 'kind', 'group', 'status', 'colour', 'color'];
const WEIGHT_KEYS = ['weight', 'size', 'value', 'count', 'amount', 'magnitude'];
const URL_KEYS = ['url', 'link', 'href'];
const TIME_KEYS = ['time', 'timestamp', 'date', 'ts'];

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
  return undefined;
};

function makePulse(lat: number, lon: number, row: Record<string, unknown>): Pulse {
  const title = String(pick(row, TITLE_KEYS) ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`);
  const category = pick(row, CATEGORY_KEYS);
  const weight = num(pick(row, WEIGHT_KEYS));
  const url = pick(row, URL_KEYS);
  const rawTime = pick(row, TIME_KEYS);
  const parsedTime = typeof rawTime === 'number' ? rawTime : rawTime ? Date.parse(String(rawTime)) : NaN;
  return {
    type: 'pulse',
    lat,
    lon,
    lang: category != null ? String(category).toLowerCase() : 'data',
    title,
    url: typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '',
    editor_type: 'user',
    // Weight drives the marker radius the same way an edit's byte count does.
    size_delta: weight != null ? Math.abs(weight) : 1500,
    ts: Number.isFinite(parsedTime) ? (parsedTime as number) : Date.now(),
  };
}

/**
 * One object off a stream, or one GeoJSON feature, as a pulse.
 * Understands flat lat/lon fields, GeoJSON `geometry.coordinates`, and a bare
 * `coordinates` pair — returns null rather than guessing when there is no location.
 */
export function pulseFromObject(input: unknown): Pulse | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const props = (obj.properties && typeof obj.properties === 'object' ? obj.properties : {}) as Record<string, unknown>;
  const row: Record<string, unknown> = { ...props, ...obj };

  // GeoJSON: [longitude, latitude], in that order.
  const geometry = (obj.geometry ?? obj) as Record<string, unknown>;
  const coords = (geometry as { coordinates?: unknown }).coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lon = num(coords[0]);
    const lat = num(coords[1]);
    if (isLat(lat) && isLon(lon)) return makePulse(lat, lon, row);
  }

  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase()] = v;
  const lat = num(pick(lower, LAT_KEYS));
  const lon = num(pick(lower, LON_KEYS));
  if (isLat(lat) && isLon(lon)) return makePulse(lat, lon, lower);
  return null;
}

/** Split one CSV line, honouring quoted fields and doubled quotes inside them. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out.map(s => s.trim());
}

/** Whichever of comma, semicolon or tab appears most often in the header row. */
export function detectDelimiter(headerLine: string): string {
  const counts = [',', ';', '\t'].map(d => [d, headerLine.split(d).length - 1] as const);
  const best = counts.sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

export function parseCsv(text: string, limit = MAX_POINTS): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { points: [], skipped: 0, error: 'The file needs a header row and at least one row of data.' };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map(h => h.toLowerCase());
  if (!headers.some(h => LAT_KEYS.includes(h)) || !headers.some(h => LON_KEYS.includes(h))) {
    return { points: [], skipped: 0, error: 'No latitude and longitude columns found. Name them lat and lon (or latitude/longitude).' };
  }
  const points: Pulse[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length && points.length < limit; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = cells[j]; });
    const p = pulseFromObject(row);
    if (p) points.push(p); else skipped++;
  }
  if (!points.length) return { points, skipped, error: 'Found the columns, but no row held a usable latitude and longitude.' };
  return { points, skipped };
}

export function parseGeoJson(text: string, limit = MAX_POINTS): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { points: [], skipped: 0, error: 'That is not valid JSON.' }; }
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { features?: unknown }).features)
      ? (data as { features: unknown[] }).features
      : [data];
  const points: Pulse[] = [];
  let skipped = 0;
  for (const item of list) {
    if (points.length >= limit) break;
    const p = pulseFromObject(item);
    if (p) points.push(p); else skipped++;
  }
  if (!points.length) return { points, skipped, error: 'No point features with coordinates were found.' };
  return { points, skipped };
}

/** Dispatch on what the text actually looks like rather than on the file extension. */
export function parseCustom(text: string, limit = MAX_POINTS): ParseResult {
  const head = text.trimStart()[0];
  return head === '{' || head === '[' ? parseGeoJson(text, limit) : parseCsv(text, limit);
}
