import { describe, it, expect } from 'vitest';
import { isoWeek, buildWeeks } from '../src/weeks.js';
import type { DaySummary } from '../src/moments.js';

const day = (date: string, over: Partial<DaySummary> = {}): DaySummary => ({
  date,
  edits: 1_000,
  photos: 100,
  all_edits: 400_000,
  measured_from: `${date}T00:00:10.000Z`,
  new_articles: 15_000,
  new_by_human: 11_000,
  new_by_lang: { en: 500 },
  top_articles: [{ title: 'Paris', lang: 'fr', url: 'https://x', count: 10 }],
  day_photos: [],
  ...over,
});

describe('isoWeek', () => {
  it('starts weeks on Monday', () => {
    expect(isoWeek('2026-09-23')).toMatchObject({ week: '2026-W39', start: '2026-09-21', end: '2026-09-27' });
    expect(isoWeek('2026-09-21').week).toBe('2026-W39'); // Monday
    expect(isoWeek('2026-09-20').week).toBe('2026-W38'); // the Sunday before
  });

  it('gives a year-end week to the year holding its Thursday', () => {
    // 1 January 2027 is a Friday, so it belongs to the last week of 2026.
    expect(isoWeek('2027-01-01').week).toBe('2026-W53');
    expect(isoWeek('2026-01-01').week).toBe('2026-W01');
  });
});

describe('buildWeeks', () => {
  it('sums a week and names its busiest day', () => {
    const [w] = buildWeeks([
      day('2026-09-23', { edits: 3_000, photos: 50 }),
      day('2026-09-22', { edits: 1_000, photos: 900 }),
      day('2026-09-21', { edits: 2_000, photos: 10 }),
    ]);
    expect(w.week).toBe('2026-W39');
    expect(w.days_recorded).toBe(3);
    expect(w.edits).toBe(6_000);
    expect(w.all_edits).toBe(1_200_000);
    expect(w.busiest_day).toEqual({ date: '2026-09-23', edits: 3_000 });
    expect(w.best_photo_day).toEqual({ date: '2026-09-22', photos: 900 });
    expect(w.top_articles[0]).toMatchObject({ title: 'Paris', count: 30 }); // merged across days
  });

  it('counts only whole days towards the all-Wikipedia total, and says how many', () => {
    const [w] = buildWeeks([
      day('2026-09-23'),
      day('2026-09-22', { measured_from: '2026-09-22T16:31:00.000Z' }), // restarted mid-afternoon
    ]);
    expect(w.all_edits).toBe(400_000);
    expect(w.all_edits_days).toBe(1);
    expect(w.days_recorded).toBe(2); // the partial day still counts as recorded
  });

  it('splits days across weeks and returns newest first', () => {
    const weeks = buildWeeks([day('2026-09-23'), day('2026-09-20'), day('2026-09-14')]);
    expect(weeks.map(w => w.week)).toEqual(['2026-W39', '2026-W38']);
    expect(weeks[1].days_recorded).toBe(2);
  });
});
