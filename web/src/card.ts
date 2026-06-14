import type { Pulse } from './types';

const el = document.getElementById('card')!;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

export function showCard(p: Pulse) {
  const sign = p.size_delta >= 0 ? '+' : '';
  el.innerHTML = `
    <strong>${escapeHtml(p.title)}</strong>
    <span class="meta">${escapeHtml(p.lang)}.wikipedia.org · ${p.editor_type} · ${sign}${p.size_delta} bytes</span>
    <a href="${encodeURI(p.url)}" target="_blank" rel="noopener">view the edit →</a>`;
  el.hidden = false;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') el.hidden = true; });
