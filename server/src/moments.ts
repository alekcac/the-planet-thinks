import type { EditorType, Pulse } from './protocol.js';

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
  /**
   * Every article edit seen that day across all Wikipedias, located or not. This is the
   * figure people mean by "how often is Wikipedia updated"; `edits` above is the subset
   * the globe could place on a map. Optional: days recorded before this existed lack it.
   */
  all_edits?: number;
  /**
   * Articles created that day across every Wikipedia — counted before the coordinate
   * lookup, so unlike `edits` this covers the whole encyclopedia and not just places.
   * Optional because days recorded before this existed have no figure to show.
   */
  new_articles?: number;
  /** How many of those a person created; the rest came from bots */
  new_by_human?: number;
  /** New articles per language edition that day, largest first */
  new_by_lang?: Record<string, number>;
  /**
   * When counting of `all_edits` began for this day, ISO 8601. After a restart the
   * counter starts from zero at whatever hour the process came back, so a day whose
   * counting began after midnight holds a partial total and must not be quoted as
   * the day's figure. Absent on days recorded before this was tracked.
   */
  measured_from?: string;
  top_articles: HotArticle[];
  day_photos: DayPhoto[];
}

const TOP_ARTICLES = 5;
const PHOTO_SAMPLE = 12;
// Enough languages to show who is writing today without turning the digest into a
// 300-row table; the tail is always a handful of articles apiece.
const NEW_LANGS = 12;
// A quarter of history: enough for the digest to be a citable record rather than a fortnight's
// scratchpad. Each day is a handful of titles and photo links, so 90 of them stay tiny.
const HISTORY_DAYS = 90;
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
  private allEdits = 0;
  private allEditsFrom: number | null = null;
  private photos = 0;
  private newArticles = 0;
  private newByHuman = 0;
  private newLangs = new Map<string, number>();
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

  /**
   * Any article edit, anywhere on Wikipedia, whether or not it can be placed on the map.
   * Called for every event the classifier accepts, so the day's total matches what the
   * per-minute counter on the stats page adds up to.
   */
  recordAnyEdit(now = Date.now()) {
    this.roll(now);
    if (this.allEditsFrom === null) this.allEditsFrom = now;
    this.allEdits++;
  }

  /**
   * A brand-new article, anywhere on Wikipedia. Called before coordinates are looked
   * up, because "how many articles appeared today" is a question about the whole
   * encyclopedia — most new articles are about people, species and events, not places.
   */
  recordNewArticle(lang: string, editor: EditorType, now = Date.now()) {
    this.roll(now);
    this.newArticles++;
    if (editor !== 'bot') this.newByHuman++;
    this.newLangs.set(lang, (this.newLangs.get(lang) ?? 0) + 1);
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
    if (this.edits || this.photos || this.newArticles || this.allEdits) {
      this.history.unshift(this.summarize());
      if (this.history.length > HISTORY_DAYS) this.history.length = HISTORY_DAYS;
    }
    this.date = d;
    this.counts.clear();
    this.edits = 0;
    this.allEdits = 0;
    this.allEditsFrom = null;
    this.photos = 0;
    this.newArticles = 0;
    this.newByHuman = 0;
    this.newLangs.clear();
    this.photoSample = [];
    this.photoSeen = 0;
  }

  private summarize(): DaySummary {
    const top = [...this.counts.values()].sort((a, b) => b.count - a.count).slice(0, TOP_ARTICLES);
    const langs = [...this.newLangs.entries()].sort((a, b) => b[1] - a[1]).slice(0, NEW_LANGS);
    return {
      date: this.date,
      edits: this.edits,
      all_edits: this.allEdits,
      ...(this.allEditsFrom === null ? {} : { measured_from: new Date(this.allEditsFrom).toISOString() }),
      photos: this.photos,
      new_articles: this.newArticles,
      new_by_human: this.newByHuman,
      new_by_lang: Object.fromEntries(langs),
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
      allEdits: this.allEdits,
      allEditsFrom: this.allEditsFrom,
      photos: this.photos,
      newArticles: this.newArticles,
      newByHuman: this.newByHuman,
      newLangs: [...this.newLangs.entries()],
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
    this.allEdits = s.allEdits ?? 0;
    this.allEditsFrom = s.allEditsFrom ?? null;
    this.photos = s.photos ?? 0;
    this.newArticles = s.newArticles ?? 0;
    this.newByHuman = s.newByHuman ?? 0;
    this.newLangs = new Map(Array.isArray(s.newLangs) ? s.newLangs : []);
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
      `<li><a href="${esc(a.url)}">${esc(a.title)}</a> (${a.lang}) — ${a.count} ${a.count === 1 ? 'edit' : 'edits'}</li>`).join('');
    const photos = d.day_photos.map(p =>
      `<a href="${esc(p.url)}">${esc(p.title)}</a>`).join(' · ');
    const born = d.new_articles
      ? `<p>${d.new_articles.toLocaleString('en-US')} new articles were created across all ` +
        `Wikipedias that day` +
        (d.new_by_human != null ? `, ${d.new_by_human.toLocaleString('en-US')} of them by people` : '') +
        `.</p>`
      : '';
    const body =
      `<p>${d.edits.toLocaleString('en-US')} edits to articles about places and ` +
      `${d.photos.toLocaleString('en-US')} freshly photographed locations.</p>` +
      born +
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
