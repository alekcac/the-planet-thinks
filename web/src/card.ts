import type { Pulse } from './types';

const el = document.getElementById('card')!;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

export function showCard(p: Pulse) {
  // Server URLs arrive already percent-encoded; re-encoding with encodeURI would double-encode
  // any %XX sequence (breaking titles with &, commas, or non-ASCII). Attribute-escaping is all
  // an href/src needs here.
  if (p.img) {
    el.innerHTML = `
      <img class="photo" src="${escapeHtml(p.img)}" alt="${escapeHtml(p.title)}" />
      <strong>${escapeHtml(p.title.replace(/\.(jpe?g|png|webp)$/i, ''))}</strong>
      <span class="meta">just uploaded to Wikimedia Commons · ${p.editor_type}</span>
      <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">view on Commons →</a>`;
    // Freshly deleted files 404 on the thumb redirect; hide the broken image, keep the card.
    el.querySelector('img')?.addEventListener('error', e => { (e.target as HTMLElement).hidden = true; });
    el.hidden = false;
    return;
  }
  const sign = p.size_delta >= 0 ? '+' : '';
  el.innerHTML = `
    <strong>${escapeHtml(p.title)}</strong>
    <span class="meta">${escapeHtml(p.lang)}.wikipedia.org · ${p.editor_type} · ${sign}${p.size_delta} bytes</span>
    <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">view the edit →</a>`;
  el.hidden = false;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') el.hidden = true; });
