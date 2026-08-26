import { createGlobe } from './globe';
import { connect } from './net';
import { qualityFor } from './quality';
import { showCard } from './card';
import { renderStats, setConnected, onToggle } from './hud';
import { Chimes } from './sound';
import { Music } from './music';
import { initAbout } from './about';
import { initCinematic } from './cinematic';
import { initEmbedBadge } from './embed';
import { parseLangFilter, parseFollowOff } from './url-params';
import type { Pulse } from './types';

const q = qualityFor(window.innerWidth, matchMedia('(pointer: coarse)').matches);
const globe = createGlobe(document.getElementById('app')!, q, showCard);
const chimes = new Chimes();
const music = new Music();

initAbout();
initCinematic();
initEmbedBadge();
onToggle('sound', on => chimes.setEnabled(on));
onToggle('music', on => music.setEnabled(on));
onToggle('follow', on => globe.setFollow(on));

// Shareable personal views (see url-params.ts). The language filter only makes sense on the
// wiki globe — the Commons stream has a single pseudo-language.
const stream = document.body.dataset.stream ?? 'wiki';
const langFilter = stream === 'wiki' ? parseLangFilter(location.search) : null;
if (parseFollowOff(location.search)) {
  globe.setFollow(false);
  const box = document.getElementById('follow') as HTMLInputElement | null;
  if (box) box.checked = false;
}

function handlePulse(p: Pulse, replayed = false) {
  if (langFilter && !langFilter.has(p.lang)) return;
  // Photo pulses warm their thumbnail BEFORE the marker lights up: by the time the tour
  // flies over, the card opens instantly with an already-cached image. (Replayed background
  // markers skip this — preloading a whole replay buffer would pull megabytes for nothing.)
  if (!replayed && p.img) {
    const warm = new Image();
    let lit = false;
    const light = () => {
      if (lit) return;
      lit = true;
      globe.addPulse(p, false);
      chimes.playShutter();
    };
    warm.onload = light;
    warm.onerror = light;
    warm.src = p.img;
    setTimeout(light, 5000); // a slow file still gets its marker, just without the head start
    return;
  }
  globe.addPulse(p, replayed);
  if (replayed) return;
  if (p.img) chimes.playShutter();
  else if (p.is_new) chimes.playNewArticle(p.size_delta);
  else chimes.play(p.size_delta);
}

function resolveWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  // In production the API lives on api.<domain>; in dev Vite proxies /ws on the page's origin.
  if (location.hostname.endsWith('theplanetthinks.com')) return 'wss://api.theplanetthinks.com/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
function referrerTag(): string {
  try { return document.referrer ? new URL(document.referrer).hostname : 'direct'; }
  catch { return 'direct'; }
}
// Pass where this visit came from once, on the first connect (net.ts drops it on reconnects).
// Pages other than the main globe pick their feed via <body data-stream>.
const params = new URLSearchParams({ ref: referrerTag() });
if (stream !== 'wiki') params.set('stream', stream);
const WS_URL = `${resolveWsUrl()}?${params}`;

connect(
  WS_URL,
  m => {
    if (m.type === 'pulse') handlePulse(m);
    else if (m.type === 'stats') renderStats(m);
    else if (m.type === 'replay') {
      // Photos arrive sparsely, so treat the newest replayed one as live: the tour then
      // has somewhere to fly right away instead of waiting minutes for a fresh upload.
      // Photos arrive minutes apart, so the newest replayed one counts as live and gives
      // the tour a destination immediately. The other streams are dense enough not to need it.
      const liveTail = stream === 'commons' ? m.events.length - 1 : -1;
      m.events.forEach((e, i) => handlePulse(e, i !== liveTail));
    }
  },
  setConnected,
);
