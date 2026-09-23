// oEmbed: paste the link, get the globe.
//
// The people who found this site through Planet OSM, weeklyOSM and Planet Wikimedia keep
// blogs and wiki pages, and one of them adding an entry to a list brought more visitors in
// a week than every social post this project has made. Their tools — Notion, WordPress,
// Ghost, Discourse — all speak oEmbed: paste a URL, and if the site answers here, the page
// turns it into the embed by itself. That removes the copy-a-snippet step entirely, and
// every embed carries the badge that links home.

export interface OEmbed {
  type: 'rich';
  version: '1.0';
  title: string;
  provider_name: string;
  provider_url: string;
  author_name: string;
  author_url: string;
  html: string;
  width: number;
  height: number;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

const HOME = 'https://theplanetthinks.com';
const DEFAULT_WIDTH = 800;
const RATIO = 9 / 16;

/** Only our own globes are embeddable; anything else is not ours to describe. */
const GLOBES: Record<string, { title: string; thumb: string }> = {
  '/': { title: 'The Planet Thinks — live Wikipedia edits on a 3D globe', thumb: `${HOME}/og.jpg` },
  '/photos': { title: 'The Planet Thinks — live Wikimedia Commons photos on a 3D globe', thumb: `${HOME}/og-photos.jpg` },
  '/map': { title: 'The Planet Thinks — live OpenStreetMap edits on a 3D globe', thumb: `${HOME}/og.jpg` },
};

/** Trailing slashes and index.html are the same page to a reader; treat them alike. */
function normalise(pathname: string): string | null {
  let p = pathname.replace(/index\.html$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (p === '') p = '/';
  return p in GLOBES ? p : null;
}

export function oembedFor(target: string, maxwidth?: number, maxheight?: number): OEmbed | null {
  let url: URL;
  try { url = new URL(target); } catch { return null; }
  if (url.hostname !== 'theplanetthinks.com' && url.hostname !== 'www.theplanetthinks.com') return null;
  const path = normalise(url.pathname);
  if (path === null) return null;

  // Honour the host's size limits: an embed wider than the column it sits in is worse
  // than a small one, and maxheight has to win when it is the tighter constraint.
  let width = Math.min(maxwidth && maxwidth > 0 ? maxwidth : DEFAULT_WIDTH, DEFAULT_WIDTH);
  let height = Math.round(width * RATIO);
  if (maxheight && maxheight > 0 && height > maxheight) {
    height = maxheight;
    width = Math.round(height / RATIO);
  }

  const { title, thumb } = GLOBES[path];
  const src = `${HOME}${path}${path === '/' ? '' : ''}?cinematic`;
  const html =
    `<iframe src="${src}" width="${width}" height="${height}" ` +
    `style="border:0;border-radius:12px;max-width:100%" loading="lazy" allowfullscreen ` +
    `title="${title}"></iframe>`;

  return {
    type: 'rich',
    version: '1.0',
    title,
    provider_name: 'The Planet Thinks',
    provider_url: `${HOME}/`,
    author_name: 'The Planet Thinks',
    author_url: `${HOME}${path}`,
    html,
    width,
    height,
    thumbnail_url: thumb,
    thumbnail_width: 1200,
    thumbnail_height: 630,
  };
}
