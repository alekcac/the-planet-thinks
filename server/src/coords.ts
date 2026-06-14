import { LRUCache } from 'lru-cache';

export interface Coords { lat: number; lon: number; }
type CacheValue = Coords | 'none';

interface Pending { title: string; attempts: number; resolve: (c: Coords | null) => void; }

export interface CoordsResolverOpts {
  userAgent: string;
  flushMs?: number;
  maxBatch?: number;
  maxQueued?: number;
  maxAttempts?: number;
  fetchFn?: typeof fetch;
}

export class CoordsResolver {
  private cache = new LRUCache<string, CacheValue>({ max: 200_000 });
  private queues = new Map<string, Pending[]>();
  private timers = new Map<string, NodeJS.Timeout>();
  private readonly flushMs: number;
  private readonly maxBatch: number;
  private readonly maxQueued: number;
  private readonly maxAttempts: number;
  private readonly fetchFn: typeof fetch;
  private readonly userAgent: string;

  constructor(opts: CoordsResolverOpts) {
    this.userAgent = opts.userAgent;
    this.flushMs = opts.flushMs ?? 250;
    this.maxBatch = opts.maxBatch ?? 50;
    this.maxQueued = opts.maxQueued ?? 2000;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  resolve(wiki: string, title: string): Promise<Coords | null> {
    const hit = this.cache.get(`${wiki}|${title}`);
    if (hit !== undefined) return Promise.resolve(hit === 'none' ? null : hit);
    return new Promise(res => this.enqueue(wiki, { title, attempts: 0, resolve: res }));
  }

  private enqueue(wiki: string, p: Pending) {
    let q = this.queues.get(wiki);
    if (!q) { q = []; this.queues.set(wiki, q); }
    // freshness over completeness: drop the oldest when overloaded
    if (q.length >= this.maxQueued) q.shift()!.resolve(null);
    q.push(p);
    if (q.length >= this.maxBatch) { void this.flush(wiki); return; }
    if (!this.timers.has(wiki)) {
      this.timers.set(wiki, setTimeout(() => void this.flush(wiki), this.flushMs));
    }
  }

  private async flush(wiki: string) {
    const timer = this.timers.get(wiki);
    if (timer) { clearTimeout(timer); this.timers.delete(wiki); }
    const q = this.queues.get(wiki) ?? [];
    const batch = q.splice(0, this.maxBatch);
    if (!batch.length) return;
    try {
      const body = new URLSearchParams({
        action: 'query',
        prop: 'coordinates',
        coprimary: 'primary',
        format: 'json',
        formatversion: '2',
        titles: batch.map(p => p.title).join('|'),
      });
      const resp = await this.fetchFn(`https://${wiki}/w/api.php`, {
        method: 'POST',
        body,
        headers: { 'User-Agent': this.userAgent },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        query?: {
          pages?: { title: string; coordinates?: { lat: number; lon: number }[] }[];
          normalized?: { from: string; to: string }[];
        };
      };
      const byTitle = new Map<string, Coords | null>();
      for (const page of data.query?.pages ?? []) {
        const c = page.coordinates?.[0];
        byTitle.set(page.title, c ? { lat: c.lat, lon: c.lon } : null);
      }
      for (const norm of data.query?.normalized ?? []) {
        if (byTitle.has(norm.to)) byTitle.set(norm.from, byTitle.get(norm.to)!);
      }
      for (const p of batch) {
        const c = byTitle.get(p.title) ?? null;
        this.cache.set(`${wiki}|${p.title}`, c ?? 'none');
        p.resolve(c);
      }
    } catch {
      for (const p of batch) {
        p.attempts += 1;
        if (p.attempts >= this.maxAttempts) p.resolve(null);
        else this.enqueue(wiki, p);
      }
    }
  }

  dump(): [string, CacheValue][] { return [...this.cache.entries()]; }
  load(entries: [string, CacheValue][]) { for (const [k, v] of entries) this.cache.set(k, v); }
}
