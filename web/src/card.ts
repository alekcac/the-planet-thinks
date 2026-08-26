import type { Pulse } from './types';

const el = document.getElementById('card')!;
const OSM = document.body.dataset.stream === 'osm';
let osmSeq = 0;

async function describeChangeset(url: string, seq: number) {
  const id = url.match(/changeset\/(\d+)/)?.[1];
  if (!id) return;
  try {
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/changeset/${id}.json`);
    if (!res.ok) return;
    const cs = (await res.json())?.changeset;
    if (!cs || seq !== osmSeq) return; // a newer card is showing; leave it alone
    const comment = String(cs.tags?.comment ?? '').trim();
    const editor = String(cs.tags?.created_by ?? '').split(' ')[0];
    if (!comment && !editor) return;
    const line = document.createElement('span');
    line.className = 'meta';
    line.textContent = comment
      ? editor ? `“${comment}” · via ${editor}` : `“${comment}”`
      : `via ${editor}`;
    el.querySelector('a')?.before(line);
  } catch {
    // Offline, rate-limited, or a changeset that has since vanished — the card is
    // already useful without this.
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

// Guards against a slow thumbnail overwriting a newer card once it finally loads.
let photoSeq = 0;

export function showCard(p: Pulse) {
  // Server URLs arrive already percent-encoded; re-encoding with encodeURI would double-encode
  // any %XX sequence (breaking titles with &, commas, or non-ASCII). Attribute-escaping is all
  // an href/src needs here.
  if (p.img) {
    const seq = ++photoSeq;
    const img = p.img;
    const render = (withImg: boolean) => {
      el.innerHTML = `
        ${withImg ? `<img class="photo" src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" />` : ''}
        <strong>${escapeHtml(p.title.replace(/\.(jpe?g|png|webp)$/i, ''))}</strong>
        <span class="meta">just uploaded to Wikimedia Commons · ${p.editor_type}</span>
        <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">view on Commons →</a>`;
      // Freshly deleted files 404 on the thumb redirect; hide the broken image, keep the card.
      el.querySelector('img')?.addEventListener('error', e => { (e.target as HTMLElement).hidden = true; });
      el.hidden = false;
    };
    // Warm the thumbnail first so the card and its photo appear together (the second
    // <img> with the same URL paints straight from cache). A slow file still shows the
    // card after a grace period rather than holding it hostage.
    let settled = false;
    const settle = (withImg: boolean) => {
      if (settled || seq !== photoSeq) return;
      settled = true;
      render(withImg);
    };
    const probe = new Image();
    probe.onload = () => settle(true);
    probe.onerror = () => settle(false);
    probe.src = img;
    setTimeout(() => settle(true), 4000);
    return;
  }
  photoSeq++; // a text card supersedes any photo card still preloading
  // An OpenStreetMap changeset is not a Wikipedia edit: no language subdomain, no byte
  // delta, and the node count is already part of its title.
  if (OSM) {
    const seq = ++osmSeq;
    el.innerHTML = `
      <strong>${escapeHtml(p.title)}</strong>
      <span class="meta">openstreetmap.org · ${escapeHtml(p.lang)}</span>
      <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">open the changeset →</a>`;
    el.hidden = false;
    // The minutely diff carries positions, not intent. The mapper's own comment lives on
    // the changeset itself, so fetch that one record — from this browser, only when
    // somebody actually clicks, which keeps it a courtesy call rather than a crawl.
    void describeChangeset(p.url, seq);
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
