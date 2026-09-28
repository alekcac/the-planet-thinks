// Is Wikipedia down?
//
// The sites that answer this question all answer the same way: they request a page and
// report whether it came back. That tells you the web servers are up, which is not the
// same thing — Wikipedia can serve every page perfectly while refusing to save an edit,
// and during a database lock that is exactly what it does.
//
// This server already holds an open connection to the feed of every saved edit, so it can
// answer the other half: are edits still arriving, and at the rate this hour usually runs
// at? Pace alone would be a bad signal on its own — Wikipedia is genuinely four times
// quieter at 03:00 UTC than at 15:00 — so the comparison is always against the same hour
// on previous days, never against a flat average.

import type { DaySummary } from './moments.js';
import { complete } from './facts.js';

export type Verdict = 'up' | 'quiet' | 'stalled' | 'unknown';

export interface Status {
  verdict: Verdict;
  /** One sentence, true on its own, safe to quote out of context */
  summary: string;
  /** Whether a page request to Wikipedia itself succeeded, and how long it took */
  site: { reachable: boolean | null; ms: number | null; checked_at: string | null };
  /** Whether edits are still reaching us, and how fast */
  edits: {
    per_minute: number;
    /** Typical rate for this UTC hour, from previous whole days; null until enough exist */
    usual_per_minute: number | null;
    /** Observed over usual, rounded; null when there is no baseline to divide by */
    ratio: number | null;
    /** Seconds since anything at all arrived on the feed */
    last_event_seconds_ago: number;
    /**
     * True while the per-minute counter has been running for less than a minute, which
     * it always is just after a restart. The rate is real but covers a shorter window,
     * so it reads low through no fault of Wikipedia's and must not be rated against the
     * baseline.
     */
    warming_up: boolean;
  };
  checked_at: string;
}

// Two minutes of total silence is far outside anything the feed does normally: even the
// quietest hour of the year still carries edits every few seconds.
const SILENT_SECONDS = 120;
// Below this share of the usual rate for the hour, something is worth saying out loud.
const QUIET_RATIO = 0.4;
// Fewer whole days than this and the "usual" figure is one day's weather, not a climate.
const MIN_BASELINE_DAYS = 3;
const BASELINE_DAYS = 14;

/** The median beats the mean here: one outage inside the window should not lower the bar. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Edits a minute that this UTC hour usually carries, from days counted end to end.
 * Partial days are excluded for the same reason they are excluded from the facts: an
 * hour the server only saw half of would drag the baseline down and make a healthy
 * Wikipedia look stalled.
 */
export function usualForHour(days: DaySummary[], hour: number): number | null {
  const samples: number[] = [];
  for (const d of days) {
    if (samples.length >= BASELINE_DAYS) break;
    if (!complete(d) || !Array.isArray(d.by_hour) || d.by_hour.length !== 24) continue;
    const n = d.by_hour[hour];
    if (typeof n === 'number' && n > 0) samples.push(n / 60);
  }
  return samples.length >= MIN_BASELINE_DAYS ? Math.round(median(samples)) : null;
}

export interface StatusInput {
  perMinute: number;
  /** When this process began counting; the rate covers at most the time since then. */
  countingSince: number;
  lastEventAt: number;
  days: DaySummary[];
  site: { reachable: boolean | null; ms: number | null; checkedAt: number | null };
}

export function buildStatus(input: StatusInput, now = Date.now()): Status {
  const silentFor = Math.round((now - input.lastEventAt) / 1000);
  const warming = now - input.countingSince < 60_000;
  const hour = new Date(now).getUTCHours();
  const usual = usualForHour(input.days, hour);
  // A rate measured over forty seconds is not a rate per minute. Comparing it to the
  // baseline would report a freshly restarted server as a quiet Wikipedia.
  const ratio = !warming && usual && usual > 0
    ? Math.round((input.perMinute / usual) * 100) / 100 : null;

  let verdict: Verdict;
  if (silentFor >= SILENT_SECONDS) verdict = 'stalled';
  else if (ratio === null) verdict = input.perMinute > 0 ? 'up' : 'unknown';
  else if (ratio < QUIET_RATIO) verdict = 'quiet';
  else verdict = 'up';

  const pace = warming
    ? 'edits are arriving'
    : `${input.perMinute} edits a minute are arriving right now`;
  const against = warming
    ? ', though this checker restarted moments ago and its per-minute figure is still filling up'
    : usual === null
      ? ', and there is not yet enough history here to say what this hour usually carries'
      : `, against the ${usual} a minute this hour usually carries`;

  const summary =
    verdict === 'stalled'
      ? `No edit has reached this server for ${silentFor} seconds. Either Wikipedia has stopped ` +
        `accepting edits or this server has lost its connection to the feed — both look the same ` +
        `from here, so treat it as a reason to check rather than as a verdict.`
      : verdict === 'quiet'
        ? `Wikipedia is still accepting edits, but slowly: ${pace}${against}.`
        : verdict === 'unknown'
          ? `Nothing has arrived in the last minute. That happens at the quietest hours without ` +
            `anything being wrong, and there is no baseline here yet to judge it against.`
          : `Wikipedia is up and being edited normally: ${pace}${against}.`;

  return {
    verdict,
    summary,
    site: {
      reachable: input.site.reachable,
      ms: input.site.ms,
      checked_at: input.site.checkedAt ? new Date(input.site.checkedAt).toISOString() : null,
    },
    edits: {
      per_minute: input.perMinute,
      usual_per_minute: usual,
      ratio,
      last_event_seconds_ago: silentFor,
      warming_up: warming,
    },
    checked_at: new Date(now).toISOString(),
  };
}
