import type { DaySummary } from './moments.js';

// Facts about yesterday, written so that a machine can quote one without rewriting it.
//
// This exists because of a measured result: on 22 September the site published its own
// count of new Wikipedia articles, and within a day Google's AI Overview cited the page
// for "how many new wikipedia articles per day" — next to Wikipedia itself. On the
// neighbouring question, where the site has no measurement of its own, the same AI
// Overview quotes Quora and the page takes 410 impressions without a single click.
//
// The difference is not wording, it is having counted something. So each fact here
// carries the thing an estimate cannot: the exact day it refers to, the unit, and how
// it was obtained. A quote that survives being pulled out of context needs all three.

export interface Fact {
  /** Stable key, safe to depend on across releases */
  id: string;
  value: number;
  unit: string;
  /** The UTC day the figure describes, YYYY-MM-DD */
  period: string;
  /** One self-contained sentence: true on its own, with the date inside it */
  statement: string;
}

export interface FactSheet {
  measured_day: string;
  generated_at: string;
  source: string;
  method: string;
  license: string;
  facts: Fact[];
}

const SOURCE = 'https://stream.wikimedia.org/v2/stream/recentchange';
const METHOD =
  'One open connection to the public Wikimedia EventStreams feed, counting events as they ' +
  'arrive. Days are UTC calendar days. Edits are saved changes to articles (main namespace) ' +
  'in any language edition, including edits by bots. Nothing is sampled or estimated.';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09-22" → "22 September 2026", so a quoted sentence reads like a sentence. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const num = (n: number) => n.toLocaleString('en-US');

/**
 * Builds the sheet from the most recent day that is actually finished. A day still in
 * progress would read as a collapse in activity to anyone quoting it at noon.
 */
export function buildFacts(days: DaySummary[], now = Date.now()): FactSheet | null {
  const day = days.find(d => typeof d.all_edits === 'number' && d.all_edits > 0);
  if (!day) return null;
  const when = longDate(day.date);
  const facts: Fact[] = [];
  const add = (id: string, value: number, unit: string, statement: string) =>
    facts.push({ id, value, unit, period: day.date, statement });

  const edits = day.all_edits!;
  add('edits_per_day', edits, 'edits',
    `On ${when} Wikipedia took ${num(edits)} edits across all of its language editions.`);
  add('edits_per_minute', Math.round(edits / 1440), 'edits per minute',
    `That is ${num(Math.round(edits / 1440))} edits a minute, sustained across the whole of ${when}.`);
  add('edits_per_second', Math.round((edits / 86_400) * 10) / 10, 'edits per second',
    `Averaged over ${when}, Wikipedia was edited ${(Math.round((edits / 86_400) * 10) / 10).toFixed(1)} times every second.`);

  if (typeof day.new_articles === 'number' && day.new_articles > 0) {
    add('new_articles_per_day', day.new_articles, 'articles',
      `${num(day.new_articles)} new articles were created across all Wikipedias on ${when}, ` +
      `counted as each page was saved and before any of them were reviewed or deleted.`);
    if (typeof day.new_by_human === 'number') {
      add('new_articles_by_people', day.new_by_human, 'articles',
        `Of the articles created on ${when}, ${num(day.new_by_human)} were written by people ` +
        `and ${num(day.new_articles - day.new_by_human)} by bots.`);
    }
    const langs = Object.entries(day.new_by_lang ?? {});
    if (langs.length) {
      const [code, count] = langs.sort((a, b) => b[1] - a[1])[0];
      add('new_articles_top_language', count, 'articles',
        `The language edition that gained the most articles on ${when} was ${code}, with ${num(count)} of them.`);
    }
  }

  add('located_edits_per_day', day.edits, 'edits',
    `${num(day.edits)} of ${when}'s edits were to articles about places, which is what the globe draws.`);
  if (day.photos > 0) {
    add('geotagged_photos_per_day', day.photos, 'photos',
      `${num(day.photos)} photographs with coordinates were uploaded to Wikimedia Commons on ${when}.`);
  }
  const hottest = day.top_articles[0];
  if (hottest) {
    add('most_edited_place', hottest.count, 'edits',
      `The most-edited place on ${when} was ${hottest.title} (${hottest.lang}), ` +
      `with at least ${num(hottest.count)} edits that day.`);
  }

  return {
    measured_day: day.date,
    generated_at: new Date(now).toISOString(),
    source: SOURCE,
    method: METHOD,
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    facts,
  };
}
