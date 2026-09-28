import { describe, it, expect } from 'vitest';
import { buildStatus, usualForHour } from '../src/status.js';
import type { DaySummary } from '../src/moments.js';

const NOON = Date.parse('2026-09-28T12:30:00Z');

const day = (date: string, atNoon: number, over: Partial<DaySummary> = {}): DaySummary => {
  const by_hour = new Array(24).fill(100);
  by_hour[12] = atNoon;
  return {
    date, edits: 1, photos: 0, all_edits: 1000,
    measured_from: `${date}T00:00:15.000Z`,
    by_hour, top_articles: [], day_photos: [], ...over,
  };
};

const site = { reachable: true, ms: 120, checkedAt: NOON };

describe('usualForHour', () => {
  it('takes the median of that same hour on whole days', () => {
    const days = [day('2026-09-27', 1200), day('2026-09-26', 18_000), day('2026-09-25', 1800)];
    // 18,000 was an outage-recovery backlog; the median refuses to let it set the bar.
    expect(usualForHour(days, 12)).toBe(30); // median 1,800 edits / 60
  });

  it('will not build a baseline from part-days or from too few', () => {
    const partial = day('2026-09-27', 1200, { measured_from: '2026-09-27T16:30:00.000Z' });
    expect(usualForHour([partial, day('2026-09-26', 1200), day('2026-09-25', 1200)], 12)).toBeNull();
    expect(usualForHour([day('2026-09-27', 1200), day('2026-09-26', 1200)], 12)).toBeNull();
  });
});

describe('buildStatus', () => {
  const days = [day('2026-09-27', 1800), day('2026-09-26', 1800), day('2026-09-25', 1800)];

  it('calls it up when the pace matches the hour', () => {
    const s = buildStatus({ perMinute: 28, lastEventAt: NOON - 1000, days, site }, NOON);
    expect(s.verdict).toBe('up');
    expect(s.edits.usual_per_minute).toBe(30);
    expect(s.summary).toContain('being edited normally');
  });

  it('calls it quiet when the pace collapses against that hour', () => {
    const s = buildStatus({ perMinute: 6, lastEventAt: NOON - 1000, days, site }, NOON);
    expect(s.verdict).toBe('quiet');
    expect(s.edits.ratio).toBe(0.2);
  });

  it('will not blame Wikipedia for its own lost connection', () => {
    const s = buildStatus({ perMinute: 0, lastEventAt: NOON - 300_000, days, site }, NOON);
    expect(s.verdict).toBe('stalled');
    // The honest reading of silence: two causes, indistinguishable from this end.
    expect(s.summary).toContain('lost its connection');
  });

  it('says nothing about a pace it has no baseline for', () => {
    const s = buildStatus({ perMinute: 3, lastEventAt: NOON - 1000, days: [], site }, NOON);
    expect(s.edits.usual_per_minute).toBeNull();
    expect(s.edits.ratio).toBeNull();
    expect(s.verdict).toBe('up'); // edits are arriving; we simply cannot rate the pace
    expect(s.summary).toContain('not yet enough history');
  });
});
