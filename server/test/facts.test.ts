import { describe, it, expect } from 'vitest';
import { buildFacts } from '../src/facts.js';
import type { DaySummary } from '../src/moments.js';

const day = (over: Partial<DaySummary> = {}): DaySummary => ({
  date: '2026-09-22',
  edits: 94_000,
  all_edits: 471_032,
  photos: 6_296,
  new_articles: 15_400,
  new_by_human: 11_100,
  new_by_lang: { en: 600, ce: 4_000 },
  measured_from: '2026-09-22T00:00:31.000Z',
  top_articles: [{ title: 'Agra Fort', lang: 'en', url: 'https://x', count: 188 }],
  day_photos: [],
  ...over,
});

describe('buildFacts', () => {
  it('quotes the day it measured, in words a sentence can carry', () => {
    const sheet = buildFacts([day()])!;
    expect(sheet.measured_day).toBe('2026-09-22');
    const byId = Object.fromEntries(sheet.facts.map(f => [f.id, f]));
    expect(byId.edits_per_day.value).toBe(471_032);
    expect(byId.edits_per_day.statement).toBe(
      'On 22 September 2026 Wikipedia took 471,032 edits across all of its language editions.',
    );
    expect(byId.edits_per_minute.value).toBe(327);
    expect(byId.edits_per_second.value).toBeCloseTo(5.5, 1);
    // The busiest language is reported, not the first one the object happens to list.
    expect(byId.new_articles_top_language.statement).toContain('ce');
    expect(byId.new_articles_by_people.statement).toContain('4,300 by bots');
    // Every fact says which day it belongs to, or it cannot be quoted safely.
    for (const f of sheet.facts) expect(f.period).toBe('2026-09-22');
  });

  it('ignores a day that is still being counted', () => {
    // A day in progress, sitting in front of finished ones, would read as a collapse.
    const sheet = buildFacts([day({ date: '2026-09-23', all_edits: 0 }), day()])!;
    expect(sheet.measured_day).toBe('2026-09-22');
  });

  it('refuses a day the server only saw part of', () => {
    // The real case this guards: a restart at 16:30 leaves the counter holding about a
    // third of the day, which would be published as the day's total.
    const halfSeen = day({ date: '2026-09-23', all_edits: 171_479, measured_from: '2026-09-23T16:31:00.000Z' });
    expect(buildFacts([halfSeen])).toBeNull();
    // With a finished day behind it, that one is used instead.
    expect(buildFacts([halfSeen, day()])!.measured_day).toBe('2026-09-22');
  });

  it('refuses a day recorded before coverage was tracked', () => {
    expect(buildFacts([day({ measured_from: undefined })])).toBeNull();
  });

  it('returns nothing rather than a fact it cannot stand behind', () => {
    expect(buildFacts([])).toBeNull();
    expect(buildFacts([day({ all_edits: undefined })])).toBeNull();
  });

  it('leaves out figures the day does not have', () => {
    const sheet = buildFacts([day({ new_articles: 0, photos: 0, top_articles: [] })])!;
    const ids = sheet.facts.map(f => f.id);
    expect(ids).not.toContain('new_articles_per_day');
    expect(ids).not.toContain('geotagged_photos_per_day');
    expect(ids).not.toContain('most_edited_place');
    expect(ids).toContain('edits_per_day');
  });
});
