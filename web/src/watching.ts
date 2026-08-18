/**
 * Label for the ambient "watching now" line. A count of 1 is just the viewer
 * themselves — no social proof — so anything below 2 hides the line entirely.
 */
export function watchingLabel(watching: number | undefined): string | null {
  if (typeof watching !== 'number' || !Number.isFinite(watching) || watching < 2) return null;
  return `${Math.floor(watching)} people watching now`;
}
