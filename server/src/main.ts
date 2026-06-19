import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { EventSource } from 'eventsource';
import { classify } from './classify.js';
import { CoordsResolver } from './coords.js';
import { ReplayBuffer } from './replay.js';
import { StatsTracker } from './stats.js';
import type { Pulse, ServerMessage } from './protocol.js';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? './data';
const STREAM_URL = process.env.STREAM_URL ?? 'https://stream.wikimedia.org/v2/stream/recentchange';
const USER_AGENT = process.env.USER_AGENT ?? 'earth-globe/0.1 (set USER_AGENT to a contact URL)';
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS ?? 5000); // cap connections so a spike can't exhaust a shared host
const CACHE_FILE = path.join(DATA_DIR, 'coords.json');

const resolver = new CoordsResolver({ userAgent: USER_AGENT });
const buffer = new ReplayBuffer();
const stats = new StatsTracker();

fs.mkdirSync(DATA_DIR, { recursive: true });
try {
  resolver.load(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')));
  console.log('coords cache loaded');
} catch {
  console.log('starting with an empty coords cache');
}
setInterval(() => fs.writeFile(CACHE_FILE, JSON.stringify(resolver.dump()), () => {}), 5 * 60_000);

// Where visitors came from: counted once per page load (the client sends ?ref on first connect).
const REF_FILE = path.join(DATA_DIR, 'referrers.json');
const referrers = new Map<string, number>();
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(REF_FILE, 'utf8')))) {
    referrers.set(k, v as number);
  }
} catch { /* start empty */ }
setInterval(() => fs.writeFile(REF_FILE, JSON.stringify(Object.fromEntries(referrers)), () => {}), 5 * 60_000);

// Time on site: a client holds a WebSocket open for as long as the tab is open, so the lifetime
// of each connection is a good proxy for dwell time. We keep an aggregate histogram (no per-user
// data) plus a running sum, persisted across restarts. Reconnects can split one visit into a few
// sessions, so the median is more trustworthy than the mean.
const DWELL_FILE = path.join(DATA_DIR, 'dwell.json');
const DWELL_LOWER = [0, 10, 30, 60, 180, 600, 1800]; // bucket lower bounds (seconds)
const DWELL_UPPER = [10, 30, 60, 180, 600, 1800, 3600]; // upper bounds (last is a 30m+ estimate cap)
const DWELL_LABELS = ['<10s', '10-30s', '30-60s', '1-3m', '3-10m', '10-30m', '30m+'];
const dwell = { sessions: 0, sumSec: 0, buckets: new Array(DWELL_LABELS.length).fill(0) as number[] };
try {
  const s = JSON.parse(fs.readFileSync(DWELL_FILE, 'utf8'));
  if (typeof s.sessions === 'number') dwell.sessions = s.sessions;
  if (typeof s.sumSec === 'number') dwell.sumSec = s.sumSec;
  if (Array.isArray(s.buckets) && s.buckets.length === DWELL_LABELS.length) dwell.buckets = s.buckets;
} catch { /* start empty */ }
setInterval(() => fs.writeFile(DWELL_FILE, JSON.stringify(dwell), () => {}), 5 * 60_000);

function recordDwell(ms: number) {
  const sec = ms / 1000;
  if (!(sec >= 0) || sec > 86_400) return; // ignore negative / absurd (>24h)
  dwell.sessions++;
  dwell.sumSec += sec;
  let bi = DWELL_LOWER.length - 1;
  for (let i = 0; i < DWELL_UPPER.length; i++) { if (sec < DWELL_UPPER[i]) { bi = i; break; } }
  dwell.buckets[bi]++;
}

function dwellSnapshot() {
  const n = dwell.sessions;
  const mean = n ? dwell.sumSec / n : 0;
  let cum = 0, median = 0; const half = n / 2;
  for (let i = 0; i < dwell.buckets.length; i++) {
    if (cum + dwell.buckets[i] >= half) {
      const into = dwell.buckets[i] ? (half - cum) / dwell.buckets[i] : 0;
      median = DWELL_LOWER[i] + into * (DWELL_UPPER[i] - DWELL_LOWER[i]);
      break;
    }
    cum += dwell.buckets[i];
  }
  const histogram: Record<string, number> = {};
  DWELL_LABELS.forEach((l, i) => { histogram[l] = dwell.buckets[i]; });
  return { sessions: n, mean_sec: Math.round(mean), median_sec: Math.round(median), histogram };
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size, ...stats.snapshot() }));
  } else if (req.url === '/referrers') {
    res.setHeader('content-type', 'application/json');
    const sorted = [...referrers.entries()].sort((a, b) => b[1] - a[1]);
    res.end(JSON.stringify(Object.fromEntries(sorted)));
  } else if (req.url === '/dwell') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ live: wss.clients.size, ...dwellSnapshot() }));
  } else {
    res.statusCode = 404;
    res.end();
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  if (wss.clients.size > MAX_CLIENTS) { ws.close(1013, 'at capacity'); return; }
  const t0 = Date.now();
  ws.on('close', () => recordDwell(Date.now() - t0));
  try {
    const ref = (new URL(req.url ?? '/', 'http://x').searchParams.get('ref') ?? '').slice(0, 80);
    if (ref && (referrers.has(ref) || referrers.size < 1000)) {
      referrers.set(ref, (referrers.get(ref) ?? 0) + 1);
    }
  } catch { /* ignore malformed ref */ }
  ws.send(JSON.stringify({ type: 'replay', events: buffer.list() } satisfies ServerMessage));
});

function broadcast(msg: ServerMessage) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}
setInterval(() => broadcast(stats.snapshot()), 5000);

let es: EventSource | null = null;
let lastEventAt = Date.now();

function startStream() {
  es?.close();
  es = new EventSource(STREAM_URL, {
    fetch: (url, init) =>
      fetch(url, { ...init, headers: { ...(init?.headers ?? {}), 'User-Agent': USER_AGENT } }),
  });
  es.onopen = () => console.log('stream connected');
  es.onerror = err => console.error('stream error', err);
  es.onmessage = async ev => {
    lastEventAt = Date.now(); // any raw event (not just geo-located ones) proves the feed is alive
    let rc: unknown;
    try { rc = JSON.parse(ev.data); } catch { return; }
    const edit = classify(rc as Parameters<typeof classify>[0]);
    if (!edit) return;
    stats.recordTotal();
    const coords = await resolver.resolve(edit.wiki, edit.title);
    if (!coords) return;
    const pulse: Pulse = {
      type: 'pulse',
      lat: coords.lat,
      lon: coords.lon,
      lang: edit.lang,
      title: edit.title,
      url: edit.url,
      editor_type: edit.editor_type,
      size_delta: edit.size_delta,
      ts: edit.ts,
    };
    buffer.push(pulse);
    stats.recordGeo(pulse.lang);
    broadcast(pulse);
  };
}

startStream();

// The upstream SSE feed occasionally drops (or goes silent) and the client library doesn't
// always recover — leaving the server up but starved of events. If nothing arrives for a
// while, rebuild the connection from scratch so the globe never goes permanently dark.
const STREAM_STALE_MS = Number(process.env.STREAM_STALE_MS ?? 60_000);
setInterval(() => {
  const idle = Date.now() - lastEventAt;
  if (idle > STREAM_STALE_MS) {
    console.warn(`no stream events for ${Math.round(idle / 1000)}s — restarting stream`);
    lastEventAt = Date.now(); // give the fresh connection time to warm up before re-checking
    startStream();
  }
}, 15_000);

// Behind Caddy's reverse proxy, keep idle upstream connections alive longer than the proxy does,
// so Node never closes one just as Caddy reuses it (that race surfaces as occasional empty
// responses). headersTimeout must stay above keepAliveTimeout.
server.keepAliveTimeout = 75_000;
server.headersTimeout = 80_000;

server.listen(PORT, () => console.log(`listening on :${PORT}`));
