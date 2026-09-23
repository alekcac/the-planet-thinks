import { describe, it, expect } from 'vitest';
import { MomentsTracker, buildMomentsRss, dayOf } from '../src/moments.js';
import type { Pulse } from '../src/protocol.js';

const DAY1 = Date.UTC(2026, 7, 18, 10, 0, 0);
const DAY2 = Date.UTC(2026, 7, 19, 0, 30, 0);

function edit(title: string, ts = DAY1, lang = 'en'): Pulse {
  return { type: 'pulse', lat: 0, lon: 0, lang, title, url: `https://x/${title}`, editor_type: 'user', size_delta: 1, ts };
}
function edifIn(title: string, place: string, ts = DAY1, lang = 'en'): Pulse {
  return { ...edit(title, ts, lang), place };
}
function photo(title: string, ts = DAY1): Pulse {
  return { ...edit(title, ts, 'commons'), img: `https://img/${title}` };
}

describe('MomentsTracker', () => {
  it('counts the day and ranks the hottest articles', () => {
    const m = new MomentsTracker(DAY1);
    for (let i = 0; i < 3; i++) m.recordEdit(edit('Paris'), DAY1 + i);
    m.recordEdit(edit('Oslo'), DAY1);
    m.recordPhoto(photo('cat.jpg'), DAY1);
    const { today } = m.snapshot(DAY1 + 1000);
    expect(today.date).toBe('2026-08-18');
    expect(today.edits).toBe(4);
    expect(today.photos).toBe(1);
    expect(today.top_articles[0]).toMatchObject({ title: 'Paris', count: 3 });
    expect(today.day_photos[0]).toMatchObject({ title: 'cat.jpg', img: 'https://img/cat.jpg' });
  });

  it('counts located edits by country and ranks places inside one', () => {
    const m = new MomentsTracker(DAY1);
    m.recordEdit(edifIn('Berlin', 'Germany'), DAY1);
    m.recordEdit(edifIn('Berlin', 'Germany'), DAY1);
    m.recordEdit(edifIn('Hamburg', 'Germany'), DAY1);
    m.recordEdit(edifIn('Lyon', 'France'), DAY1);
    m.recordEdit(edit('Nowhere'), DAY1); // no country: still a located edit, just unplaced
    const { today } = m.snapshot(DAY1 + 1000);
    expect(today.edits).toBe(5);
    expect(today.by_country).toEqual({ Germany: 3, France: 1 });
    expect(m.topInCountry('Germany')[0]).toMatchObject({ title: 'Berlin', count: 2 });
    expect(m.topInCountry('Spain')).toEqual([]);
  });

  it('starts each country\'s day from zero', () => {
    const m = new MomentsTracker(DAY1);
    m.recordEdit(edifIn('Berlin', 'Germany'), DAY1);
    m.recordEdit(edifIn('Lyon', 'France'), DAY2); // rolls the day
    const { today, days } = m.snapshot(DAY2);
    expect(days[0].by_country).toEqual({ Germany: 1 });
    expect(today.by_country).toEqual({ France: 1 });
    expect(m.topInCountry('Germany')).toEqual([]); // yesterday's titles are gone
  });

  it('counts every edit, not just the ones it can map', () => {
    const m = new MomentsTracker(DAY1);
    for (let i = 0; i < 5; i++) m.recordAnyEdit(DAY1);
    m.recordEdit(edit('Paris'), DAY1); // one of those five also had coordinates
    const { today } = m.snapshot(DAY1 + 1000);
    expect(today.all_edits).toBe(5);
    expect(today.edits).toBe(1);
  });

  it('counts new articles across all wikis, splitting people from bots', () => {
    const m = new MomentsTracker(DAY1);
    m.recordNewArticle('en', 'user', DAY1);
    m.recordNewArticle('en', 'anon', DAY1);
    m.recordNewArticle('ce', 'bot', DAY1);
    m.recordNewArticle('ce', 'bot', DAY1);
    m.recordNewArticle('ce', 'bot', DAY1);
    const { today } = m.snapshot(DAY1 + 1000);
    expect(today.new_articles).toBe(5);
    expect(today.new_by_human).toBe(2);
    // Languages are ordered by how many articles each gained, biggest first.
    expect(Object.keys(today.new_by_lang!)).toEqual(['ce', 'en']);
    expect(today.new_by_lang).toEqual({ ce: 3, en: 2 });
  });

  it('seals a day that saw only new articles, and resets the tally', () => {
    const m = new MomentsTracker(DAY1);
    m.recordNewArticle('en', 'user', DAY1);
    m.recordNewArticle('fr', 'user', DAY2); // rolls the day over
    const { today, days } = m.snapshot(DAY2);
    expect(days[0]).toMatchObject({ date: '2026-08-18', new_articles: 1, edits: 0 });
    expect(today).toMatchObject({ date: '2026-08-19', new_articles: 1, new_by_lang: { fr: 1 } });
  });

  it('carries the new-article tally through dump and load', () => {
    const m = new MomentsTracker(DAY1);
    m.recordNewArticle('de', 'user', DAY1);
    m.recordNewArticle('de', 'bot', DAY1);
    const restored = new MomentsTracker(DAY1);
    restored.load(m.dump());
    expect(restored.snapshot(DAY1).today).toMatchObject({
      new_articles: 2, new_by_human: 1, new_by_lang: { de: 2 },
    });
  });

  it('seals the finished day into history when a new day starts', () => {
    const m = new MomentsTracker(DAY1);
    m.recordEdit(edit('Paris'), DAY1);
    m.recordEdit(edit('Lima', DAY2), DAY2);
    const snap = m.snapshot(DAY2);
    expect(snap.days).toHaveLength(1);
    expect(snap.days[0].date).toBe('2026-08-18');
    expect(snap.days[0].edits).toBe(1);
    expect(snap.today.date).toBe('2026-08-19');
    expect(snap.today.edits).toBe(1);
  });

  it('keeps a bounded photo sample while counting every photo', () => {
    const m = new MomentsTracker(DAY1, () => 0.999); // rng never replaces a slot
    for (let i = 0; i < 30; i++) m.recordPhoto(photo(`p${i}.jpg`, DAY1 + i), DAY1 + i);
    const { today } = m.snapshot(DAY1 + 1000);
    expect(today.photos).toBe(30);
    expect(today.day_photos).toHaveLength(12);
  });

  it('survives a dump/load round-trip', () => {
    const m = new MomentsTracker(DAY1);
    m.recordEdit(edit('Paris'), DAY1);
    m.recordEdit(edit('Lima', DAY2), DAY2); // day 1 now sealed in history
    const m2 = new MomentsTracker(DAY2);
    m2.load(JSON.parse(JSON.stringify(m.dump())));
    const snap = m2.snapshot(DAY2 + 1000);
    expect(snap.today.edits).toBe(1);
    expect(snap.days[0].edits).toBe(1);
  });
});

describe('buildMomentsRss', () => {
  it('escapes markup and emits one item per day', () => {
    const days = [{
      date: '2026-08-18',
      edits: 1234,
      photos: 56,
      top_articles: [{ title: 'A & B <C>', lang: 'en', url: 'https://x/a?b=1&c=2', count: 9 }],
      day_photos: [{ title: 'p "q".jpg', url: 'https://x/p', ts: DAY1 }],
    }];
    const xml = buildMomentsRss(days);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('hottest place: A &amp; B &lt;C&gt;');
    // The description carries escaped HTML, so its ampersands are escaped twice.
    expect(xml).toContain('b=1&amp;amp;c=2');
    expect(xml).not.toContain('<C>');
    expect(xml).toContain('<pubDate>Tue, 18 Aug 2026 23:59:59 GMT</pubDate>');
  });

  it('produces a valid empty channel before the first day closes', () => {
    const xml = buildMomentsRss([]);
    expect(xml).toContain('</channel>');
    expect(xml).not.toContain('<item>');
  });
});

describe('dayOf', () => {
  it('buckets by UTC calendar day', () => {
    expect(dayOf(Date.UTC(2026, 7, 18, 23, 59, 59))).toBe('2026-08-18');
    expect(dayOf(Date.UTC(2026, 7, 19, 0, 0, 1))).toBe('2026-08-19');
  });
});
