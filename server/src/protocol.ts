export type EditorType = 'user' | 'anon' | 'bot';

export interface Pulse {
  type: 'pulse';
  lat: number;
  lon: number;
  /** Wikipedia language code, e.g. "en" — or "commons" for photo uploads */
  lang: string;
  title: string;
  /** Diff URL for edits, article URL for new pages, file page for uploads */
  url: string;
  editor_type: EditorType;
  /** Bytes added; negative means removed */
  size_delta: number;
  /** Epoch milliseconds */
  ts: number;
  /** Image thumbnail URL — present only on Commons photo pulses */
  img?: string;
}

export interface Stats {
  type: 'stats';
  /** Article edits per minute across all Wikipedias */
  total_rate: number;
  /** Pulses per minute shown on the globe */
  geo_rate: number;
  /** Pulses per minute by language, rolling minute */
  by_lang: Record<string, number>;
}

export interface Replay {
  type: 'replay';
  events: Pulse[];
}

export type ServerMessage = Pulse | Stats | Replay;
