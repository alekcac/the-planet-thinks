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
}

export interface ArticleEdit {
  wiki: string; // server_name, e.g. en.wikipedia.org
  lang: string;
  title: string;
  url: string;
  editor_type: EditorType;
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
    size_delta: (rc.length?.new ?? 0) - (rc.length?.old ?? 0),
    ts: rc.meta?.dt ? Date.parse(rc.meta.dt) : Date.now(),
  };
}
