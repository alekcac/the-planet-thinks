import type { DaySummary, HotArticle } from './moments.js';
import { complete } from './facts.js';

// Weekly roll-up of the daily digest.
//
// The daily page is for people watching today; a week is what other people cite. The
// single entry someone made in a community list turned into a weeklyOSM item and brought
// more visitors in a week than every social post this project has made — and weeklyOSM is
// a weekly. A week also survives being linked: /moments?day=… is stale tomorrow, while
// "the week of 21 September" stays true forever.

export interface WeekSummary {
  /** ISO week, e.g. 2026-W39 — the key a permalink is built from */
  week: string;
  /** Monday and Sunday of that week, YYYY-MM-DD */
  start: string;
  end: string;
  /** Days of the week with data at all */
  days_recorded: number;
  /** Geo-located edits, summed over the days recorded */
  edits: number;
  photos: number;
  /**
   * Edits across all Wikipedias, summed over the days counted end to end only —
   * `all_edits_days` says how many those were, so a partial week is never mistaken
   * for a quiet one.
   */
  all_edits: number;
  all_edits_days: number;
  new_articles: number;
  new_articles_days: number;
  /** The places edited most across the whole week */
  top_articles: HotArticle[];
  /** The day inside the week with the most located edits */
  busiest_day: { date: string; edits: number } | null;
  /** The day with the most photographs */
  best_photo_day: { date: string; photos: number } | null;
}

const TOP_ARTICLES = 8;

/**
 * ISO-8601 week of a UTC date. Weeks start on Monday, and the week belongs to whichever
 * year holds its Thursday — which is why the last days of December can read as W01 of
 * the next year, and why this cannot be done by dividing the day number by seven.
 */
export function isoWeek(date: string): { week: string; start: string; end: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstMonday = new Date(firstThursday);
  firstMonday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7));
  const index = Math.round((monday.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { week: `${year}-W${String(index).padStart(2, '0')}`, start: iso(monday), end: iso(sunday) };
}

export function buildWeeks(days: DaySummary[]): WeekSummary[] {
  const byWeek = new Map<string, DaySummary[]>();
  for (const d of days) {
    const { week } = isoWeek(d.date);
    const list = byWeek.get(week);
    if (list) list.push(d); else byWeek.set(week, [d]);
  }

  const weeks: WeekSummary[] = [];
  for (const [week, list] of byWeek) {
    const { start, end } = isoWeek(list[0].date);
    const counted = list.filter(complete);
    const withNew = list.filter(d => typeof d.new_articles === 'number' && d.new_articles > 0);

    const places = new Map<string, HotArticle>();
    for (const d of list) {
      for (const a of d.top_articles) {
        const key = `${a.lang}\n${a.title}`;
        const seen = places.get(key);
        if (seen) seen.count += a.count;
        else places.set(key, { ...a });
      }
    }

    const busiest = list.reduce<DaySummary | null>((b, d) => (!b || d.edits > b.edits ? d : b), null);
    const photoDay = list.reduce<DaySummary | null>((b, d) => (!b || d.photos > b.photos ? d : b), null);

    weeks.push({
      week,
      start,
      end,
      days_recorded: list.length,
      edits: list.reduce((n, d) => n + d.edits, 0),
      photos: list.reduce((n, d) => n + d.photos, 0),
      all_edits: counted.reduce((n, d) => n + (d.all_edits ?? 0), 0),
      all_edits_days: counted.length,
      new_articles: withNew.reduce((n, d) => n + (d.new_articles ?? 0), 0),
      new_articles_days: withNew.length,
      top_articles: [...places.values()].sort((a, b) => b.count - a.count).slice(0, TOP_ARTICLES),
      busiest_day: busiest && busiest.edits > 0 ? { date: busiest.date, edits: busiest.edits } : null,
      best_photo_day: photoDay && photoDay.photos > 0 ? { date: photoDay.date, photos: photoDay.photos } : null,
    });
  }
  // Newest first, matching the order the daily history arrives in.
  return weeks.sort((a, b) => (a.week < b.week ? 1 : -1));
}
