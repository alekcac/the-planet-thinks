// When the globe is embedded on someone else's site, show a small corner badge
// linking home. The badge is the traffic half of the embed loop (the SEO half is
// the credit link in the copy-paste snippet on /screensaver). Never shown on the
// site itself — only inside iframes.
export function initEmbedBadge() {
  let framed = false;
  try { framed = window.self !== window.top; } catch { framed = true; } // cross-origin parent
  if (!framed) return;
  const a = document.createElement('a');
  a.className = 'embed-badge';
  a.href = 'https://theplanetthinks.com/';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = '🌍 theplanetthinks.com';
  a.title = 'The Planet Thinks — live Wikipedia edits on a 3D globe';
  document.body.appendChild(a);
}
