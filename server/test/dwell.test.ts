import { describe, it, expect } from 'vitest';
import { DwellTracker } from '../src/dwell.js';

const T0 = Date.parse('2026-10-06T12:00:00Z');

describe('DwellTracker', () => {
  it('buckets sessions and reports mean and median', () => {
    const d = new DwellTracker();
    d.record(5_000, 'direct', T0);
    d.record(45_000, 'direct', T0);
    d.record(120_000, 'direct', T0);
    const s = d.snapshot();
    expect(s.sessions).toBe(3);
    expect(s.histogram).toMatchObject({ '<10s': 1, '30-60s': 1, '1-3m': 1 });
    expect(s.mean_sec).toBe(Math.round((5 + 45 + 120) / 3));
    expect(s.median_sec).toBeGreaterThanOrEqual(30);
    expect(s.median_sec).toBeLessThanOrEqual(60);
  });

  it('ignores negative and absurd durations', () => {
    const d = new DwellTracker();
    d.record(-1, 'direct', T0);
    d.record(90_000_000, 'direct', T0);
    expect(d.snapshot().sessions).toBe(0);
  });

  it('splits the histogram by referrer and ranks referrers by sessions', () => {
    const d = new DwellTracker();
    for (let i = 0; i < 4; i++) d.record(3_000, 'whip.run', T0);
    d.record(600_000, 'whip.run', T0);
    d.record(400_000, 'weeklyosm.eu', T0);
    d.record(5_000, '', T0); // no referrer tag at all
    const s = d.snapshot();
    expect(s.by_ref[0]).toMatchObject({ ref: 'whip.run', sessions: 5, under_10s: 4 });
    expect(s.by_ref[0].median_sec).toBeLessThan(10);
    expect(s.by_ref[1]).toMatchObject({ ref: 'weeklyosm.eu', sessions: 1, under_10s: 0 });
    expect(s.by_ref.find(r => r.ref === 'unknown')).toMatchObject({ sessions: 1 });
  });

  it('folds referrers past the cap into "other"', () => {
    const d = new DwellTracker(3);
    d.record(1_000, 'a', T0);
    d.record(1_000, 'b', T0);
    d.record(1_000, 'c', T0);
    d.record(1_000, 'd', T0);
    d.record(1_000, 'a', T0);
    const refs = Object.fromEntries(d.snapshot().by_ref.map(r => [r.ref, r.sessions]));
    expect(refs).toEqual({ a: 2, b: 1, c: 1, other: 1 });
  });

  it('counts sessions per UTC day of close and keeps a bounded window', () => {
    const d = new DwellTracker(200, 3);
    d.record(1_000, 'direct', Date.parse('2026-10-01T23:59:00Z'));
    d.record(1_000, 'direct', Date.parse('2026-10-02T00:01:00Z'));
    d.record(1_000, 'direct', Date.parse('2026-10-02T15:00:00Z'));
    d.record(1_000, 'direct', Date.parse('2026-10-03T15:00:00Z'));
    d.record(1_000, 'direct', Date.parse('2026-10-04T15:00:00Z'));
    expect(d.snapshot().days).toEqual({ '2026-10-02': 2, '2026-10-03': 1, '2026-10-04': 1 });
  });

  it('round-trips through dump/load and accepts the pre-referrer file shape', () => {
    const d = new DwellTracker();
    d.record(5_000, 'whip.run', T0);
    d.record(50_000, 'direct', T0);
    const e = new DwellTracker();
    e.load(JSON.parse(JSON.stringify(d.dump())));
    expect(e.snapshot()).toEqual(d.snapshot());

    const legacy = new DwellTracker();
    legacy.load({ sessions: 9272, sumSec: 4_250_000, buckets: [2122, 1230, 1600, 2130, 1082, 748, 360] });
    const s = legacy.snapshot();
    expect(s.sessions).toBe(9272);
    expect(s.histogram['<10s']).toBe(2122);
    expect(s.by_ref).toEqual([]);
    expect(s.days).toEqual({});
  });
});
