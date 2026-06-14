import type { Stats } from './protocol.js';

class RateCounter {
  private stamps: number[] = [];
  hit(ts = Date.now()) { this.stamps.push(ts); this.prune(ts); }
  perMin(now = Date.now()): number { this.prune(now); return this.stamps.length; }
  private prune(now: number) {
    const cutoff = now - 60_000;
    while (this.stamps.length && this.stamps[0] < cutoff) this.stamps.shift();
  }
}

export class StatsTracker {
  private total = new RateCounter();
  private geo = new RateCounter();
  private langs = new Map<string, RateCounter>();

  recordTotal(ts = Date.now()) { this.total.hit(ts); }

  recordGeo(lang: string, ts = Date.now()) {
    this.geo.hit(ts);
    let c = this.langs.get(lang);
    if (!c) { c = new RateCounter(); this.langs.set(lang, c); }
    c.hit(ts);
  }

  snapshot(now = Date.now()): Stats {
    const by_lang: Record<string, number> = {};
    for (const [lang, c] of this.langs) {
      const n = c.perMin(now);
      if (n > 0) by_lang[lang] = n;
      else this.langs.delete(lang);
    }
    return { type: 'stats', total_rate: this.total.perMin(now), geo_rate: this.geo.perMin(now), by_lang };
  }
}
