import { createGlobe } from './globe';
import { connect } from './net';
import { qualityFor } from './quality';
import { showCard } from './card';
import { renderStats, setConnected, onToggle } from './hud';
import { Chimes } from './sound';
import { Music } from './music';
import { initAbout } from './about';
import { initCinematic } from './cinematic';
import type { Pulse } from './types';

const q = qualityFor(window.innerWidth, matchMedia('(pointer: coarse)').matches);
const globe = createGlobe(document.getElementById('app')!, q, showCard);
const chimes = new Chimes();
const music = new Music();

initAbout();
initCinematic();
onToggle('sound', on => chimes.setEnabled(on));
onToggle('music', on => music.setEnabled(on));
onToggle('follow', on => globe.setFollow(on));

function handlePulse(p: Pulse, replayed = false) {
  globe.addPulse(p, replayed);
  if (!replayed) chimes.play(p.size_delta);
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
const WS_URL = `${resolveWsUrl()}?ref=${encodeURIComponent(referrerTag())}`;

connect(
  WS_URL,
  m => {
    if (m.type === 'pulse') handlePulse(m);
    else if (m.type === 'stats') renderStats(m);
    else if (m.type === 'replay') m.events.forEach(e => handlePulse(e, true));
  },
  setConnected,
);
