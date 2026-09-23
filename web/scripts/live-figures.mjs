// Puts a measured number into the stats page's title and description at build time.
//
// The page ranks on the first page for "how often is wikipedia updated" and gets no
// clicks at all: 410 impressions, zero. It is losing on the snippet, not the position,
// because a title that promises "live statistics" says nothing a reader can weigh.
// A real figure does: "about 470,000 edits a day". So the build asks the running server
// what it actually counted and writes that in.
//
// Only closed days count — today is always a partial day — and the median of the last
// week keeps one bot-heavy Tuesday from setting the headline. Three closed days are the
// minimum, because the first day after a deploy is itself partial: the counter starts at
// whatever hour the server restarted, and a median over three or more days steps past it.
// If the server cannot be reached, or too few days have been measured, the page ships with
// its original wording: a build must never fail or lie because a number was unavailable.

import { readFile, writeFile } from 'node:fs/promises';

const API = process.env.MOMENTS_URL ?? 'https://api.theplanetthinks.com/moments';
const PAGE = new URL('../dist/stats.html', import.meta.url);
const DAYS = 7;
const MIN_DAYS = 3; // fewer than this and one partial day would set the headline
const TIMEOUT_MS = 10_000;

/** 471,032 reads as a false precision for a figure that moves daily; 470,000 is honest. */
function round(n) {
  const step = n >= 100_000 ? 10_000 : n >= 10_000 ? 1_000 : n >= 1_000 ? 100 : 10;
  return Math.round(n / step) * step;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

async function figures() {
  const res = await fetch(API, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`moments responded ${res.status}`);
  const { days = [] } = await res.json();
  // Same rule the server applies to its fact sheet: a day whose counting began after
  // midnight holds a partial total, and a median cannot rescue a number that is simply wrong.
  const whole = days.filter(d => {
    if (typeof d.all_edits !== 'number' || d.all_edits <= 0 || !d.measured_from) return false;
    const began = Date.parse(d.measured_from) - Date.parse(`${d.date}T00:00:00Z`);
    return began >= 0 && began <= 120_000;
  });
  const edits = whole.map(d => d.all_edits).slice(0, DAYS);
  if (edits.length < MIN_DAYS) return null;
  return { perDay: round(median(edits)), perMinute: round(median(edits) / 1440), sample: edits.length };
}

const fmt = n => n.toLocaleString('en-US');

try {
  const f = await figures();
  if (!f) {
    console.log(`live-figures: fewer than ${MIN_DAYS} closed days measured, leaving the page as written`);
    process.exit(0);
  }
  const html = await readFile(PAGE, 'utf8');
  const title = `How Often Is Wikipedia Updated? ${fmt(f.perDay)} Edits a Day, Live`;
  const description =
    `Wikipedia takes about ${fmt(f.perDay)} edits a day — roughly ${fmt(f.perMinute)} every minute ` +
    `across ~300 language editions. Measured live, not estimated. Watch the counters move.`;
  const out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${description}$2`);
  if (out === html) {
    console.error('live-figures: could not find the title or description to replace');
    process.exit(1);
  }
  await writeFile(PAGE, out);
  console.log(`live-figures: ${fmt(f.perDay)} edits/day from ${f.sample} closed day(s)`);
} catch (err) {
  console.log(`live-figures: skipped (${err.message})`);
}
