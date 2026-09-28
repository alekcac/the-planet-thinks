// Gives every country its own address.
//
// The by-country data has existed for a week behind a query string, /places?country=Germany,
// which is one URL wearing 177 hats: a search engine sees a single page and no amount of
// distinct content behind it changes that. Search Console listed the whole site at thirteen
// known URLs. So the build stamps out one real page per country from the same template,
// each naming its own subject in the title, the description and the heading, and each
// fetching only its own figures.
//
// The pages are generated rather than written because the content is identical in shape and
// different in every value — exactly what a template is for. Nothing here invents text about
// a country: the prose is the same on all of them, and everything specific is a number the
// server measured.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const TEMPLATE = new URL('../dist/places.html', import.meta.url);
const OUT_DIR = new URL('../dist/places/', import.meta.url);
const SITEMAP = new URL('../dist/sitemap.xml', import.meta.url);
const COUNTRIES = new URL('../../server/assets/countries.json', import.meta.url);
const API = process.env.MOMENTS_URL ?? 'https://api.theplanetthinks.com/moments';
const TIMEOUT_MS = 10_000;
// A country that has not been written about in a fortnight would be a page of zeroes.
// It still exists and is still linked from the index — it is simply not pushed at Google.
const SITEMAP_DAYS = 14;

/** Must match the slug() in places.html, or the redirect from ?country= lands nowhere. */
function slug(n) {
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Which countries have been written about lately, so the sitemap holds no empty pages. */
async function active() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API, { signal: ctl.signal });
    if (!res.ok) return null;
    const { today, days } = await res.json();
    const seen = new Set();
    for (const d of [today, ...(days ?? []).slice(0, SITEMAP_DAYS)]) {
      for (const name of Object.keys(d?.by_country ?? {})) seen.add(name);
    }
    return seen.size ? seen : null;
  } catch {
    return null; // the build must never fail because a number was unavailable
  } finally {
    clearTimeout(timer);
  }
}

function pageFor(template, name) {
  const s = slug(name);
  const url = `https://theplanetthinks.com/places/${s}`;
  const title = `Wikipedia Edits About ${name}, Today — Live Count`;
  const desc =
    `How much Wikipedia wrote about ${name} today: edits to articles about places inside ` +
    `${name}, counted live, with the busiest articles and four weeks of daily totals.`;
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'The Planet Thinks', item: 'https://theplanetthinks.com/' },
      { '@type': 'ListItem', position: 2, name: 'Wikipedia edits by country', item: 'https://theplanetthinks.com/places' },
      { '@type': 'ListItem', position: 3, name: `Wikipedia edits about ${name}`, item: url },
    ],
  }, null, 2);

  let out = template;
  const swap = (pattern, replacement) => {
    if (!pattern.test(out)) throw new Error(`country pages: template no longer matches ${pattern}`);
    out = out.replace(pattern, replacement);
  };

  swap(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  swap(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(desc)}"`);
  swap(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${url}"`);
  swap(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${url}"`);
  swap(/<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${esc(`Wikipedia edits about ${name}, today`)}"`);
  swap(/<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${esc(`Counted live from the feed of every saved edit: what Wikipedia wrote about ${name} today.`)}"`);
  // The index page's BreadcrumbList is the only two-item one in the template.
  swap(/\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "BreadcrumbList"[\s\S]*?\n {2}\}/, breadcrumb);
  swap(/<h1 id="heading">[^<]*<\/h1>/,
    `<h1 id="heading">Wikipedia is writing about ${esc(name)}</h1>`);
  // The Dataset schema on the index describes all countries at once; here it describes one.
  swap(/"name": "Wikipedia edits by country"/, `"name": ${JSON.stringify(`Wikipedia edits about ${name}`)}`);
  swap(/"url": "https:\/\/theplanetthinks\.com\/places"/, `"url": "${url}"`);
  swap(/"contentUrl": "https:\/\/api\.theplanetthinks\.com\/places\.json"/,
    `"contentUrl": "https://api.theplanetthinks.com/places.json?country=${encodeURIComponent(name)}"`);
  // The index's own view is dropped rather than hidden: leaving it in would put the same
  // table and the same paragraphs on all 177 pages, which is what duplicate content is.
  swap(/ {2}<div id="index-view">[\s\S]*?\n {2}<\/div>\n/, '');
  // Named before any script runs, so the page is about this country even without JavaScript.
  swap(/<script>\n {2}var fmt =/,
    `<script>window.__COUNTRY__ = ${JSON.stringify(name)};</script>\n<script>\n  var fmt =`);
  return out;
}

const template = await readFile(TEMPLATE, 'utf8');
const names = JSON.parse(await readFile(COUNTRIES, 'utf8')).map(c => c.n);
await mkdir(OUT_DIR, { recursive: true });

for (const name of names) {
  await writeFile(new URL(`${slug(name)}.html`, OUT_DIR), pageFor(template, name));
}

const live = await active();
const listed = live ? names.filter(n => live.has(n)) : [];
if (listed.length) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = listed.map(n =>
    `  <url>\n    <loc>https://theplanetthinks.com/places/${slug(n)}</loc>\n` +
    `    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n` +
    `    <priority>0.6</priority>\n  </url>`).join('\n');
  const sitemap = await readFile(SITEMAP, 'utf8');
  await writeFile(SITEMAP, sitemap.replace('</urlset>', `${entries}\n</urlset>`));
}

console.log(`country-pages: ${names.length} pages, ${listed.length} listed in the sitemap` +
  (live ? '' : ' (no activity data — none listed)'));
