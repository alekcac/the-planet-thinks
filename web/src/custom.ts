// The /custom entry: the same globe, fed by whatever the visitor brings.
//
// Everything here is deliberately local. A file is read with FileReader; a stream
// is opened straight from this tab to the address the visitor typed. There is no
// server of ours in the path, so there is nothing to store, nothing to leak, and
// no account to make.

import { createGlobe } from './globe';
import { qualityFor } from './quality';
import { showCard } from './card';
import { parseCustom, pulseFromObject } from './custom-data';
import type { Pulse } from './types';

// The live globes evict old markers to stay smooth under a constant stream. A dropped
// file is not a stream: its points are meant to sit there, so this page raises the
// ceiling — and then refuses to read more rows than it can honestly show.
const base = qualityFor(window.innerWidth, matchMedia('(pointer: coarse)').matches);
const coarse = matchMedia('(pointer: coarse)').matches;
const q = { ...base, maxPoints: coarse ? 400 : 2000 };
const globe = createGlobe(document.getElementById('app')!, q, showCard);
globe.setFollow(false); // somebody else's data should sit still until they move it

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dropZone = el<HTMLDivElement>('drop');
const fileInput = el<HTMLInputElement>('file');
const urlInput = el<HTMLInputElement>('url');
const connectBtn = el<HTMLButtonElement>('connect');
const clearBtn = el<HTMLButtonElement>('clear');
const statusEl = el<HTMLParagraphElement>('status');

let shown = 0;
let live: { close: () => void } | null = null;

function say(text: string, kind: '' | 'good' | 'bad' = '') {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function draw(points: Pulse[], quiet = false) {
  points.forEach(p => globe.addPulse(p, quiet));
  shown += points.length;
  clearBtn.hidden = shown === 0;
}

function reload() {
  // The globe has no "forget everything" call; a reload is honest and instant,
  // and it also drops any stream still running.
  location.href = location.pathname;
}

// ---- a file ---------------------------------------------------------------

function readFile(file: File) {
  if (file.size > 12 * 1024 * 1024) {
    say('That file is over 12 MB — trim it and try again.', 'bad');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => say('The file could not be read.', 'bad');
  reader.onload = () => {
    const { points, skipped, error } = parseCustom(String(reader.result), q.maxPoints);
    if (error) return say(error, 'bad');
    draw(points, true);
    const capped = points.length >= q.maxPoints
      ? ` — the first ${q.maxPoints}, which is all this globe holds at once`
      : '';
    const dropped = skipped ? `, ${skipped} row${skipped === 1 ? '' : 's'} without a usable location` : '';
    say(`${points.length} point${points.length === 1 ? '' : 's'} on the globe${capped}${dropped}.`, 'good');
  };
  reader.readAsText(file);
}

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) readFile(f);
});
['dragenter', 'dragover'].forEach(t =>
  dropZone.addEventListener(t, e => { e.preventDefault(); dropZone.classList.add('over'); }));
['dragleave', 'drop'].forEach(t =>
  dropZone.addEventListener(t, e => { e.preventDefault(); dropZone.classList.remove('over'); }));
dropZone.addEventListener('drop', e => {
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) readFile(f);
});
// A file dropped anywhere else on the page should not navigate away from the globe.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

// ---- a live stream --------------------------------------------------------

function handleStreamPayload(raw: string) {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return; }
  const list = Array.isArray(data) ? data : [data];
  const points = list.map(pulseFromObject).filter((p): p is Pulse => p !== null);
  if (!points.length) return;
  draw(points);
  say(`${shown} point${shown === 1 ? '' : 's'} received.`, 'good');
}

function connect(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { return say('That does not look like a URL.', 'bad'); }

  const secure = location.protocol === 'https:';
  if (secure && (url.protocol === 'http:' || url.protocol === 'ws:')) {
    return say('This page is served over HTTPS, so the browser will only open https:// or wss:// streams.', 'bad');
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    return say('Only http(s) and ws(s) addresses can be opened.', 'bad');
  }

  live?.close();
  say('Connecting…');

  if (url.protocol.startsWith('ws')) {
    const ws = new WebSocket(url.href);
    live = { close: () => ws.close() };
    ws.onopen = () => say('Connected. Waiting for events…', 'good');
    ws.onmessage = e => handleStreamPayload(String(e.data));
    ws.onerror = () => say('The connection failed. Check the address, and that the server allows this page to connect.', 'bad');
    ws.onclose = () => { if (!shown) say('The connection closed before anything arrived.', 'bad'); };
  } else {
    const es = new EventSource(url.href);
    live = { close: () => es.close() };
    es.onopen = () => say('Connected. Waiting for events…', 'good');
    es.onmessage = e => handleStreamPayload(e.data);
    es.onerror = () => {
      say('The stream could not be read. It must send text/event-stream and allow cross-origin requests.', 'bad');
      es.close();
    };
  }
  clearBtn.hidden = false;
}

connectBtn.addEventListener('click', () => connect(urlInput.value.trim()));
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') connect(urlInput.value.trim()); });
clearBtn.addEventListener('click', reload);

// A shareable link: /custom?src=https://… connects on load, so a ready-made scene
// is one URL, exactly like ?lang= and ?view= on the main globe.
const src = new URLSearchParams(location.search).get('src');
if (src) {
  urlInput.value = src;
  connect(src);
}
