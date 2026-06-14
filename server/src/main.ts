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

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size, ...stats.snapshot() }));
  } else {
    res.statusCode = 404;
    res.end();
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  if (wss.clients.size > MAX_CLIENTS) { ws.close(1013, 'at capacity'); return; }
  ws.send(JSON.stringify({ type: 'replay', events: buffer.list() } satisfies ServerMessage));
});

function broadcast(msg: ServerMessage) {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(s);
}
setInterval(() => broadcast(stats.snapshot()), 5000);

const es = new EventSource(STREAM_URL, {
  fetch: (url, init) =>
    fetch(url, { ...init, headers: { ...(init?.headers ?? {}), 'User-Agent': USER_AGENT } }),
});
es.onopen = () => console.log('stream connected');
es.onerror = err => console.error('stream error', err);
es.onmessage = async ev => {
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

server.listen(PORT, () => console.log(`listening on :${PORT}`));
