import type { Stats } from './types';

const counter = document.getElementById('counter')!;
const status = document.getElementById('status')!;

export function renderStats(s: Stats) {
  counter.textContent = `${s.total_rate} edits/min worldwide · showing ${s.geo_rate}/min about places`;
}

export function setConnected(ok: boolean) {
  status.classList.toggle('ok', ok);
  if (!ok) counter.textContent = 'reconnecting…';
}

export function onToggle(id: 'sound' | 'follow' | 'music', fn: (on: boolean) => void) {
  const box = document.getElementById(id) as HTMLInputElement;
  box.addEventListener('change', () => fn(box.checked));
}
