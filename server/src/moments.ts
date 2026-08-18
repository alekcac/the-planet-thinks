import type { Pulse } from './protocol.js';

// Daily digest: which places got edited the most, and a fair sample of the day's
// photos. Everything is bucketed by UTC calendar day; when the first event of a
// new day arrives, the finished day is sealed into `history` and served via the
// /moments JSON endpoint and the /moments.xml RSS feed.

export interface HotArticle { title: string; lang: string; url: string; count: number; }
export interface DayPhoto { title: string; url: string; img?: string; ts: number; }
export interface DaySummary {
  /** UTC calendar day, YYYY-MM-DD */
  date: string;
  /** Geo-located edits recorded that day */
  edits: number;
  /** Geo-located Commons photos recorded that day */
  photos: number;
  top_articles: HotArticle[];
  day_photos: DayPhoto[];
}

const TOP_ARTICLES = 5;
const PHOTO_SAMPLE = 12;
const HISTORY_DAYS = 14;
// A day sees tens of thousands of distinct geo-edited titles; once the map grows past
// this, titles seen only once (the long tail) are dropped — the day's top can't be there.
const MAX_TITLES = 20_000;

export function dayOf(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export class MomentsTracker {
  private date: string;
  private counts = new Map<string, HotArticle>();
  private edits = 0;
  private photos = 0;
  private photoSample: DayPhoto[] = [];
  private photoSeen = 0;
  history: DaySummary[] = [];

  constructor(now = Date.now(), private rng: () => number = Math.random) {
    this.date = dayOf(now);
  }

  recordEdit(p: Pulse, now = Date.now()) {
    this.roll(now);
    this.edits++;
    const key = `${p.lang}\n${p.title}`;
    const a = this.counts.get(key);
    if (a) a.count++;
    else {
      if (this.counts.size >= MAX_TITLES) this.pruneSingles();
      this.counts.set(key, { title: p.title, lang: p.lang, url: p.url, count: 1 });
    }
  }

  recordPhoto(p: Pulse, now = Date.now()) {
    this.roll(now);
    this.photos++;
    // Reservoir sample: every photo of the day has an equal chance of ending up in
    // the digest, instead of the grid showing only whatever arrived last.
    const photo: DayPhoto = { title: p.title, url: p.url, img: p.img, ts: p.ts };
    this.photoSeen++;
    if (this.photoSample.length < PHOTO_SAMPLE) this.photoSample.push(photo);
    else {
      const i = Math.floor(this.rng() * this.photoSeen);
      if (i < PHOTO_SAMPLE) this.photoSample[i] = photo;
    }
  }

  snapshot(now = Date.now()): { today: DaySummary; days: DaySummary[] } {
    this.roll(now);
    return { today: this.summarize(), days: this.history };
  }

  private roll(now: number) {
    const d = dayOf(now);
    if (d === this.date) return;
    if (this.edits || this.photos) {
      this.history.unshift(this.summarize());
      if (this.history.length > HISTORY_DAYS) this.history.length = HISTORY_DAYS;
    }
    this.date = d;
    this.counts.clear();
    this.edits = 0;
    this.photos = 0;
    this.photoSample = [];
    this.photoSeen = 0;
  }

  private summarize(): DaySummary {
    const top = [...this.counts.values()].sort((a, b) => b.count - a.count).slice(0, TOP_ARTICLES);
    return {
      date: this.date,
      edits: this.edits,
      photos: this.photos,
      top_articles: top,
      day_photos: [...this.photoSample].sort((a, b) => a.ts - b.ts),
    };
  }

  private pruneSingles() {
    for (const [k, a] of this.counts) if (a.count === 1) this.counts.delete(k);
  }

  dump() {
    return {
      date: this.date,
      edits: this.edits,
      photos: this.photos,
      photoSeen: this.photoSeen,
      photoSample: this.photoSample,
      counts: [...this.counts.values()],
      history: this.history,
    };
  }

  load(s: ReturnType<MomentsTracker['dump']>) {
    if (!s || typeof s.date !== 'string') return;
    this.date = s.date;
    this.edits = s.edits ?? 0;
    this.photos = s.photos ?? 0;
    this.photoSeen = s.photoSeen ?? 0;
    this.photoSample = Array.isArray(s.photoSample) ? s.photoSample : [];
    this.counts.clear();
    if (Array.isArray(s.counts)) {
      for (const a of s.counts) this.counts.set(`${a.lang}\n${a.title}`, a);
    }
    this.history = Array.isArray(s.history) ? s.history : [];
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildMomentsRss(days: DaySummary[], pageUrl = 'https://theplanetthinks.com/moments'): string {
  const items = days.map(d => {
    const hottest = d.top_articles[0];
    const title = `${d.date} — ${d.edits.toLocaleString('en-US')} located edits` +
      (hottest ? `; hottest place: ${hottest.title}` : '');
    const top = d.top_articles.map(a =>
      `<li><a href="${esc(a.url)}">${esc(a.title)}</a> (${a.lang}) — ${a.count} edits</li>`).join('');
    const photos = d.day_photos.map(p =>
      `<a href="${esc(p.url)}">${esc(p.title)}</a>`).join(' · ');
    const body =
      `<p>${d.edits.toLocaleString('en-US')} edits to articles about places and ` +
      `${d.photos.toLocaleString('en-US')} freshly photographed locations.</p>` +
      (top ? `<p>Most-edited places:</p><ol>${top}</ol>` : '') +
      (photos ? `<p>Photos of the day: ${photos}</p>` : '');
    return `  <item>\n` +
      `    <title>${esc(title)}</title>\n` +
      `    <link>${esc(`${pageUrl}#${d.date}`)}</link>\n` +
      `    <guid>${esc(`${pageUrl}#${d.date}`)}</guid>\n` +
      `    <pubDate>${new Date(`${d.date}T23:59:59Z`).toUTCString()}</pubDate>\n` +
      `    <description>${esc(body)}</description>\n` +
      `  </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n<channel>\n` +
    `  <title>The Planet Thinks — daily moments</title>\n` +
    `  <link>${esc(pageUrl)}</link>\n` +
    `  <description>What the planet edited and photographed each day: the most-edited Wikipedia places and a sample of fresh Wikimedia Commons photos.</description>\n` +
    (items ? items + '\n' : '') +
    `</channel>\n</rss>\n`;
}
