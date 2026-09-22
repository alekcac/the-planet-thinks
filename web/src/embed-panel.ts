// "Embed" as a thing you can find, rather than a snippet buried on another page.
//
// The audience that arrived through Planet OSM, Planet Wikimedia and weeklyOSM is made of
// people who run blogs and wiki pages — the exact people who embed a widget. Until now the
// snippet lived at /screensaver#embed, which you had to already know about. This puts a
// button next to the other controls, on every globe, that hands over the iframe for the
// globe you are actually looking at.

const HOME = 'https://theplanetthinks.com';

/** The title each globe should carry inside somebody else's page. */
function describe(path: string): { label: string; embedPath: string } {
  if (path.startsWith('/photos')) {
    return { label: 'The Planet Thinks — live Wikimedia Commons photos on a 3D globe', embedPath: '/photos' };
  }
  if (path.startsWith('/map')) {
    return { label: 'The Planet Thinks — live OpenStreetMap edits on a 3D globe', embedPath: '/map' };
  }
  return { label: 'The Planet Thinks — live Wikipedia edits on a 3D globe', embedPath: '/' };
}

function snippetFor(path: string): string {
  const { label, embedPath } = describe(path);
  const src = `${HOME}${embedPath}${embedPath === '/' ? '?' : '?'}cinematic`;
  return (
    `<iframe src="${src}"\n` +
    `  style="width:100%;max-width:800px;aspect-ratio:16/9;border:0;border-radius:12px"\n` +
    `  loading="lazy" allowfullscreen\n` +
    `  title="${label}"></iframe>\n` +
    `<p><a href="${HOME}${embedPath}">${label}</a></p>`
  );
}

export function initEmbedPanel() {
  const btn = document.getElementById('embed-btn');
  if (!btn) return;
  // Offering an embed button inside an embed would be a hall of mirrors.
  let framed = false;
  try { framed = window.self !== window.top; } catch { framed = true; }
  if (framed) { btn.remove(); return; }

  const snippet = snippetFor(location.pathname);

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="modal-card">' +
    '<button class="modal-close" type="button" aria-label="Close">×</button>' +
    '<h2>Put this globe on your page</h2>' +
    '<p>It keeps running wherever it lands — a blog post, a wiki page, a dashboard. ' +
    'No account, no key, nothing to maintain.</p>' +
    '<pre class="embed-code"><code></code></pre>' +
    '<p><button class="embed-copy" type="button">Copy the snippet</button> ' +
    '<span class="embed-said" role="status"></span></p>' +
    '<p class="muted">Tune the scene with URL options: <code>&amp;lang=de</code> for one language, ' +
    '<code>&amp;view=51,10,1.6</code> to park the camera, <code>&amp;follow=off</code> to stop it ' +
    'chasing edits. <a href="/screensaver#embed">More options and a TV-sized version</a>.</p>' +
    '</div>';
  (modal.querySelector('code') as HTMLElement).textContent = snippet;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent =
    '.embed-code { background: rgba(120,150,255,0.09); border: 1px solid rgba(120,150,255,0.22);' +
    ' border-radius: 9px; padding: 11px 13px; overflow-x: auto; font-size: 11.5px; line-height: 1.5;' +
    ' margin: 0 0 12px; white-space: pre; }' +
    '.embed-copy { background: rgba(120,150,255,0.16); color: inherit; font: inherit; font-size: 13px;' +
    ' cursor: pointer; border: 1px solid rgba(120,150,255,0.35); border-radius: 8px; padding: 6px 12px; }' +
    '.embed-copy:hover { background: rgba(120,150,255,0.26); }' +
    '.embed-said { font-size: 12.5px; opacity: 0.7; margin-left: 8px; }';
  document.head.appendChild(style);

  const said = modal.querySelector('.embed-said') as HTMLElement;
  const open = () => { modal.hidden = false; said.textContent = ''; };
  const close = () => { modal.hidden = true; };

  btn.addEventListener('click', open);
  modal.querySelector('.modal-close')!.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });

  modal.querySelector('.embed-copy')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      said.textContent = 'copied';
    } catch {
      // Clipboard access is denied in some browsers and over plain http; select it
      // instead so the reader can copy by hand rather than being told nothing happened.
      const code = modal.querySelector('code')!;
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      said.textContent = 'selected — press ⌘C';
    }
  });
}
