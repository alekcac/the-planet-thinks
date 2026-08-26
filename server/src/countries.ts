// Which country a point falls in, without asking anyone.
//
// Naming a place is the obvious way to make a bare coordinate mean something, and
// the obvious way to do it is a reverse-geocoding API. Nominatim, the free one,
// asks callers to stay under a request a second and not to use it in bulk — and
// this feed alone produces about fifty changesets a minute. So the lookup lives
// here instead: Natural Earth's 110m country outlines (public domain), rounded to
// two decimals, are enough to answer "which country" and cost one file on disk.
//
// The resolution is deliberately coarse: ~1 km, no disputed-border opinions, no
// city names. A point just offshore returns nothing rather than a guess.

import fs from 'node:fs';

interface Country { n: string; p: number[][][]; }
interface Indexed { name: string; rings: number[][][]; minLon: number; maxLon: number; minLat: number; maxLat: number; }

let index: Indexed[] = [];

export function loadCountries(file: string): number {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Country[];
    index = raw.map(c => {
      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
      for (const ring of c.p) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
      return { name: c.n, rings: c.p, minLon, maxLon, minLat, maxLat };
    });
  } catch {
    index = []; // no file, no labels — everything else keeps working
  }
  return index.length;
}

/** Ray casting: count crossings of the ring by a ray heading east from the point. */
function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The country containing this point, or null offshore and in the gaps. */
export function countryAt(lat: number, lon: number): string | null {
  for (const c of index) {
    if (lon < c.minLon || lon > c.maxLon || lat < c.minLat || lat > c.maxLat) continue;
    for (const ring of c.rings) if (inRing(lon, lat, ring)) return c.name;
  }
  return null;
}
