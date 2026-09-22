// When the globe is embedded on someone else's site, show a small corner badge
// linking home. The badge is the traffic half of the embed loop (the SEO half is
// the credit link in the copy-paste snippet on /screensaver). Never shown on the
// site itself — only inside iframes.
/** What this globe is showing, so the badge describes the one being embedded. */
function subject(): { short: string; full: string; path: string } {
  switch (document.body.dataset.stream) {
    case 'commons':
      return {
        short: 'live Commons photos',
        full: 'The Planet Thinks — live Wikimedia Commons photos on a 3D globe',
        path: '/photos',
      };
    case 'osm':
      return {
        short: 'live OpenStreetMap edits',
        full: 'The Planet Thinks — live OpenStreetMap edits on a 3D globe',
        path: '/map',
      };
    default:
      return {
        short: 'live Wikipedia edits',
        full: 'The Planet Thinks — live Wikipedia edits on a 3D globe',
        path: '/',
      };
  }
}

export function initEmbedBadge() {
  let framed = false;
  try { framed = window.self !== window.top; } catch { framed = true; } // cross-origin parent
  if (!framed) return;
  const { short, full, path } = subject();
  const a = document.createElement('a');
  a.className = 'embed-badge';
  a.href = `https://theplanetthinks.com${path}`;
  a.target = '_blank';
  a.rel = 'noopener';
  // The naming rule applies hardest here: this badge is how a stranger first meets the
  // name, and a bare domain teaches them nothing to remember it by.
  a.textContent = `🌍 ${short} · theplanetthinks.com`;
  a.title = full;
  document.body.appendChild(a);
}
