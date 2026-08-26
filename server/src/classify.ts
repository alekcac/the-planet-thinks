import type { EditorType } from './protocol.js';

export interface RcEvent {
  type?: string;
  namespace?: number;
  title?: string;
  bot?: boolean;
  user?: string;
  server_name?: string;
  length?: { old?: number; new?: number };
  revision?: { old?: number; new?: number };
  meta?: { dt?: string };
  log_type?: string;
  log_action?: string;
}

export interface ArticleEdit {
  wiki: string; // server_name, e.g. en.wikipedia.org
  lang: string;
  title: string;
  url: string;
  editor_type: EditorType;
  /** True when this edit created the article */
  is_new?: boolean;
  size_delta: number;
  ts: number;
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;
const TEMP_ACCOUNT = /^~\d{4}-/;

export function editorType(rc: RcEvent): EditorType {
  if (rc.bot) return 'bot';
  const u = rc.user ?? '';
  if (TEMP_ACCOUNT.test(u) || IPV4.test(u) || (u.includes(':') && IPV6.test(u))) return 'anon';
  return 'user';
}

export interface CommonsUpload {
  /** Full page title, e.g. "File:Sunset in Kyiv.jpg" — used for the coordinates lookup */
  title: string;
  /** File name without the namespace prefix */
  file: string;
  /** File description page */
  url: string;
  /** Thumbnail via Special:FilePath (redirects to the sized image) */
  img: string;
  editor_type: EditorType;
  ts: number;
}

// Plain raster photos only: predictable thumbnails, and the kind of camera/phone uploads
// that carry EXIF locations. Skips svg/pdf/video/etc.
const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

export function classifyCommonsUpload(rc: RcEvent): CommonsUpload | null {
  if (rc.server_name !== 'commons.wikimedia.org') return null;
  if (rc.type !== 'log' || rc.log_type !== 'upload' || rc.log_action !== 'upload') return null;
  if (rc.namespace !== 6 || !rc.title) return null;
  const file = rc.title.replace(/^File:/, '');
  if (!PHOTO_EXT.test(file)) return null;
  const under = encodeURIComponent(file.replace(/ /g, '_'));
  return {
    title: rc.title,
    file,
    url: `https://commons.wikimedia.org/wiki/File:${under}`,
    img: `https://commons.wikimedia.org/wiki/Special:FilePath/${under}?width=640`,
    editor_type: editorType(rc),
    ts: rc.meta?.dt ? Date.parse(rc.meta.dt) : Date.now(),
  };
}

export function classify(rc: RcEvent): ArticleEdit | null {
  if (!rc.server_name?.endsWith('.wikipedia.org')) return null;
  if (rc.type !== 'edit' && rc.type !== 'new') return null;
  if (rc.namespace !== 0 || !rc.title) return null;
  const url =
    rc.type === 'edit' && rc.revision?.new != null && rc.revision?.old != null
      ? `https://${rc.server_name}/w/index.php?diff=${rc.revision.new}&oldid=${rc.revision.old}`
      : `https://${rc.server_name}/wiki/${encodeURIComponent(rc.title.replace(/ /g, '_'))}`;
  return {
    wiki: rc.server_name,
    lang: rc.server_name.split('.')[0],
    title: rc.title,
    url,
    editor_type: editorType(rc),
    // Only set when true: an absent field keeps the payload small and lets older
    // clients ignore it entirely.
    ...(rc.type === 'new' ? { is_new: true as const } : {}),
    size_delta: (rc.length?.new ?? 0) - (rc.length?.old ?? 0),
    ts: rc.meta?.dt ? Date.parse(rc.meta.dt) : Date.now(),
  };
}
