// Time on site. A client holds a WebSocket open for as long as the tab is open, so the lifetime
// of each connection is a good proxy for dwell time. We keep aggregate histograms (no per-user
// data): one overall, one per referrer, plus sessions per UTC day. Reconnects can split one visit
// into a few sessions, so the median is more trustworthy than the mean.
//
// The per-referrer split exists because the overall histogram lies by omission: when a catalogue
// starts loading the globe inside a 974x547 iframe, half of all sessions end within ten seconds
// and the overall numbers cannot say whose visitors those are.

const LOWER = [0, 10, 30, 60, 180, 600, 1800]; // bucket lower bounds (seconds)
const UPPER = [10, 30, 60, 180, 600, 1800, 3600]; // upper bounds (last is a 30m+ estimate cap)
const LABELS = ['<10s', '10-30s', '30-60s', '1-3m', '3-10m', '10-30m', '30m+'];

type Hist = { sessions: number; sumSec: number; buckets: number[] };

const emptyHist = (): Hist => ({ sessions: 0, sumSec: 0, buckets: new Array(LABELS.length).fill(0) });

function add(h: Hist, sec: number) {
  h.sessions++;
  h.sumSec += sec;
  let bi = LOWER.length - 1;
  for (let i = 0; i < UPPER.length; i++) { if (sec < UPPER[i]) { bi = i; break; } }
  h.buckets[bi]++;
}

function median(h: Hist): number {
  let cum = 0; const half = h.sessions / 2;
  for (let i = 0; i < h.buckets.length; i++) {
    if (cum + h.buckets[i] >= half) {
      const into = h.buckets[i] ? (half - cum) / h.buckets[i] : 0;
      return LOWER[i] + into * (UPPER[i] - LOWER[i]);
    }
    cum += h.buckets[i];
  }
  return 0;
}

function histLoad(raw: unknown): Hist | null {
  const s = raw as Partial<Hist> | null;
  if (!s || typeof s.sessions !== 'number' || typeof s.sumSec !== 'number') return null;
  if (!Array.isArray(s.buckets) || s.buckets.length !== LABELS.length) return null;
  return { sessions: s.sessions, sumSec: s.sumSec, buckets: s.buckets.map(Number) };
}

export type RefDwell = { ref: string; sessions: number; median_sec: number; under_10s: number };

export class DwellTracker {
  private total = emptyHist();
  private byRef = new Map<string, Hist>();
  private days = new Map<string, number>();

  constructor(private readonly maxRefs = 200, private readonly maxDays = 90) {}

  record(ms: number, ref: string, now = Date.now()) {
    const sec = ms / 1000;
    if (!(sec >= 0) || sec > 86_400) return; // ignore negative / absurd (>24h)
    add(this.total, sec);

    let key = ref || 'unknown';
    if (!this.byRef.has(key) && this.byRef.size >= this.maxRefs) key = 'other';
    let h = this.byRef.get(key);
    if (!h) { h = emptyHist(); this.byRef.set(key, h); }
    add(h, sec);

    const day = new Date(now).toISOString().slice(0, 10);
    this.days.set(day, (this.days.get(day) ?? 0) + 1);
    while (this.days.size > this.maxDays) {
      const oldest = [...this.days.keys()].sort()[0];
      this.days.delete(oldest);
    }
  }

  snapshot() {
    const n = this.total.sessions;
    const histogram: Record<string, number> = {};
    LABELS.forEach((l, i) => { histogram[l] = this.total.buckets[i]; });
    const by_ref: RefDwell[] = [...this.byRef]
      .map(([ref, h]) => ({ ref, sessions: h.sessions, median_sec: Math.round(median(h)), under_10s: h.buckets[0] }))
      .sort((a, b) => b.sessions - a.sessions);
    const days: Record<string, number> = {};
    for (const k of [...this.days.keys()].sort()) days[k] = this.days.get(k)!;
    return {
      sessions: n,
      mean_sec: Math.round(n ? this.total.sumSec / n : 0),
      median_sec: Math.round(median(this.total)),
      histogram,
      by_ref,
      days,
    };
  }

  dump() {
    return {
      ...this.total,
      byRef: Object.fromEntries(this.byRef),
      days: Object.fromEntries(this.days),
    };
  }

  /** Accepts both the current shape and the older {sessions, sumSec, buckets}-only file. */
  load(raw: unknown) {
    const total = histLoad(raw);
    if (total) this.total = total;
    const r = raw as { byRef?: Record<string, unknown>; days?: Record<string, unknown> };
    if (r && r.byRef && typeof r.byRef === 'object') {
      for (const [k, v] of Object.entries(r.byRef)) {
        const h = histLoad(v);
        if (h) this.byRef.set(k, h);
      }
    }
    if (r && r.days && typeof r.days === 'object') {
      for (const [k, v] of Object.entries(r.days)) if (typeof v === 'number') this.days.set(k, v);
    }
  }
}
