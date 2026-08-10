// Shareable personal views — the URL is the whole config, no accounts:
//   /?lang=de,fr        show only edits from those language editions
//   /?view=48.9,2.3,1.6 open the camera at lat,lng[,altitude]
//   /?follow=off        keep the camera where it is (no auto-tour flights)
// Combined with /?cinematic this turns a link into a ready-made ambient scene,
// e.g. an OBS source showing only German edits parked over Europe.

/** Language filter: null = no filtering. Codes are wiki subdomains (de, zh-yue, simple…). */
export function parseLangFilter(search: string): Set<string> | null {
  const raw = new URLSearchParams(search).get('lang');
  if (!raw) return null;
  const codes = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => /^[a-z][a-z0-9-]{1,11}$/.test(s));
  return codes.length ? new Set(codes) : null;
}

export interface ViewPoint { lat: number; lng: number; altitude: number; }

/** Opening camera position: null = default sunrise intro. */
export function parseView(search: string, defaultAltitude = 2.4): ViewPoint | null {
  const raw = new URLSearchParams(search).get('view');
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length < 2 || parts.some(n => !Number.isFinite(n))) return null;
  const [lat, lng, alt] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const altitude = parts.length >= 3 ? Math.min(5, Math.max(0.3, alt)) : defaultAltitude;
  return { lat, lng, altitude };
}

/** true → the tour should not fly the camera around. */
export function parseFollowOff(search: string): boolean {
  const v = new URLSearchParams(search).get('follow');
  return v === 'off' || v === '0' || v === 'false';
}
