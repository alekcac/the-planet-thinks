import type { Stats } from './types';
import { watchingLabel } from './watching';

const counter = document.getElementById('counter')!;
const status = document.getElementById('status')!;
const watching = document.getElementById('watching');

const stream = document.body.dataset.stream ?? 'wiki';

function counterText(s: Stats): string {
  if (stream === 'commons') return `${s.total_rate} photos uploaded/min · showing ${s.geo_rate}/min with a location`;
  // OpenStreetMap publishes a file a minute rather than a live feed, so there is no
  // "of which located" split: every changeset in the batch already has a place.
  if (stream === 'osm') return `${s.geo_rate} OpenStreetMap changesets/min`;
  return `${s.total_rate} edits/min worldwide · showing ${s.geo_rate}/min about places`;
}

export function renderStats(s: Stats) {
  counter.textContent = counterText(s);
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
