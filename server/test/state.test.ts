import { describe, it, expect } from 'vitest';
import { ReplayBuffer } from '../src/replay.js';
import { StatsTracker } from '../src/stats.js';
import type { Pulse } from '../src/protocol.js';

function pulse(ts: number, lang = 'en'): Pulse {
  return { type: 'pulse', lat: 0, lon: 0, lang, title: 't', url: 'u', editor_type: 'user', size_delta: 1, ts };
}

describe('ReplayBuffer', () => {
  it('keeps only the last window', () => {
    const b = new ReplayBuffer(60_000, 500);
    b.push(pulse(0));
    b.push(pulse(30_000));
    b.push(pulse(70_000));
    expect(b.list(70_000).map(p => p.ts)).toEqual([30_000, 70_000]);
  });
  it('caps the number of events', () => {
    const b = new ReplayBuffer(60_000, 3);
    for (let i = 0; i < 10; i++) b.push(pulse(1000 + i));
    expect(b.list(2000)).toHaveLength(3);
  });
});

describe('StatsTracker', () => {
  it('reports rolling per-minute rates and per-language counts', () => {
    const s = new StatsTracker();
    s.recordTotal(0); s.recordTotal(1000); s.recordTotal(2000);
    s.recordGeo('en', 1000); s.recordGeo('de', 2000);
    const snap = s.snapshot(30_000);
    expect(snap).toMatchObject({ type: 'stats', total_rate: 3, geo_rate: 2, by_lang: { en: 1, de: 1 } });
    const later = s.snapshot(120_000);
    expect(later.total_rate).toBe(0);
    expect(later.by_lang).toEqual({});
  });
});
