import type { Stats } from './types';
import { watchingLabel } from './watching';

const counter = document.getElementById('counter')!;
const status = document.getElementById('status')!;
const watching = document.getElementById('watching');

const photosMode = document.body.dataset.stream === 'commons';

export function renderStats(s: Stats) {
  counter.textContent = photosMode
    ? `${s.total_rate} photos uploaded/min · showing ${s.geo_rate}/min with a location`
    : `${s.total_rate} edits/min worldwide · showing ${s.geo_rate}/min about places`;
  if (watching) {
    const label = watchingLabel(s.watching);
    watching.textContent = label ?? '';
    watching.hidden = label === null;
  }
}

export function setConnected(ok: boolean) {
  status.classList.toggle('ok', ok);
  if (!ok) counter.textContent = 'reconnecting…';
}

export function onToggle(id: 'sound' | 'follow' | 'music', fn: (on: boolean) => void) {
  const box = document.getElementById(id) as HTMLInputElement;
  box.addEventListener('change', () => fn(box.checked));
}
