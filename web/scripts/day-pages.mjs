// Gives every finished day its own address.
//
// The day figures are already the site's most citable thing — a number nobody else
// publishes, carrying the exact date it refers to — and they already have permanent links
// of the form /moments?day=2026-08-25. A query string is not an address a search engine
// counts, and a dated page is exactly what an assistant prefers to cite over one that says
// "today". So each closed day gets a real page.
//
// The build asks the running server which days it has and stamps out one page each, with
// the date written into the title, the description and the canonical. A daily empty commit
// keeps that list current, the same mechanism that keeps the stats page's figure fresh.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const TEMPLATE = new URL('../dist/day.html', import.meta.url);
const OUT_DIR = new URL('../dist/day/', import.meta.url);
const SITEMAP = new URL('../dist/sitemap.xml', import.meta.url);
const API = process.env.MOMENTS_URL ?? 'https://api.theplanetthinks.com/moments';
const TIMEOUT_MS = 10_000;
// The digest itself keeps 90 days; there is nothing to show beyond that.
const MAX_DAYS = 90;
const COVERED_FROM_MS = 120_000;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Same rule as facts.json and the page itself: a day counted from its first minute. */
function whole(d) {
  if (typeof d.all_edits !== 'number' || d.all_edits <= 0 || !d.measured_from) return false;
  const began = Date.parse(d.measured_from) - Date.parse(`${d.date}T00:00:00Z`);
  return began >= 0 && began <= COVERED_FROM_MS;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const num = n => n.toLocaleString('en-US');

async function days() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API, { signal: ctl.signal });
    if (!res.ok) return [];
    const body = await res.json();
    return (body.days ?? []).slice(0, MAX_DAYS);
  } catch {
    return []; // a build must never fail because a number was unavailable
  } finally {
    clearTimeout(timer);
  }
}

function pageFor(template, day) {
  const when = longDate(day.date);
  const url = `https://theplanetthinks.com/day/${day.date}`;
  const counted = whole(day);
  // The title carries the figure only when the day was counted end to end. A partial day
  // with a number in its title would be a wrong number in the most quotable place there is.
  const title = counted
    ? `Wikipedia on ${when}: ${num(day.all_edits)} Edits Measured`
    : `Wikipedia on ${when} — What Was Measured`;
  const desc = counted
    ? `On ${when} Wikipedia took ${num(day.all_edits)} edits across every language edition` +
      (day.new_articles ? `, gained ${num(day.new_articles)} new articles` : '') +
      `, and ${num(day.edits)} of those edits were to articles about places. Counted from the live feed, not estimated.`
    : `What was measured of ${when} on Wikipedia: ${num(day.edits)} edits to articles about places` +
      (day.photos ? ` and ${num(day.photos)} geotagged photographs` : '') +
      (day.measured_from
        ? `. Counting began partway through the day, so whole-day totals are absent rather than short.`
        : `. Whether this day was watched from its first minute was not recorded, so whole-day totals are withheld.`);

  let out = template;
  const swap = (pattern, replacement) => {
    if (!pattern.test(out)) throw new Error(`day pages: template no longer matches ${pattern}`);
    out = out.replace(pattern, replacement);
  };

  swap(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  swap(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(desc)}"`);
  swap(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${url}"`);
  swap(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${url}"`);
  swap(/<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${esc(`Wikipedia on ${when}`)}"`);
  swap(/<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${esc(desc)}"`);
  swap(/"name": "Wikipedia, one day measured"/, `"name": ${JSON.stringify(`Wikipedia on ${when}`)}`);
  swap(/"url": "https:\/\/theplanetthinks\.com\/day"/, `"url": "${url}"`);
  // A dataset about one day should say which day, in the field built for exactly that.
  swap(/"isBasedOn": "https:\/\/stream\.wikimedia\.org\/v2\/stream\/recentchange"/,
    `"temporalCoverage": "${day.date}",\n    "isBasedOn": "https://stream.wikimedia.org/v2/stream/recentchange"`);
  swap(/"name": "One day measured", "item": "https:\/\/theplanetthinks\.com\/day"/,
    `"name": ${JSON.stringify(when)}, "item": "${url}"`);
  swap(/<h1 id="heading">[^<]*<\/h1>/, `<h1 id="heading">Wikipedia on ${esc(when)}</h1>`);
  swap(/<script>\n {2}var API =/,
    `<script>window.__DAY__ = ${JSON.stringify(day.date)};</script>\n<script>\n  var API =`);
  return out;
}

const template = await readFile(TEMPLATE, 'utf8');
const list = await days();
await mkdir(OUT_DIR, { recursive: true });

for (const day of list) {
  await writeFile(new URL(`${day.date}.html`, OUT_DIR), pageFor(template, day));
}

if (list.length) {
  const entries = [`  <url>\n    <loc>https://theplanetthinks.com/day</loc>\n` +
    `    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`]
    .concat(list.map(d =>
      // A finished day never changes again, so its lastmod is the day after it closed.
      `  <url>\n    <loc>https://theplanetthinks.com/day/${d.date}</loc>\n` +
      `    <lastmod>${d.date}</lastmod>\n    <changefreq>never</changefreq>\n` +
      `    <priority>0.5</priority>\n  </url>`)).join('\n');
  const sitemap = await readFile(SITEMAP, 'utf8');
  await writeFile(SITEMAP, sitemap.replace('</urlset>', `${entries}\n</urlset>`));
}

console.log(`day-pages: ${list.length} day(s), ${list.filter(whole).length} counted end to end`);
