import * as THREE from 'three';

const DEG = Math.PI / 180;

/** Sub-solar point (where the sun is directly overhead) for a given instant. */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - yearStart) / 86_400_000);
  const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const lon = -15 * (utcHours - 12);
  return { lat: declination, lon };
}

/**
 * Unit vector pointing at the sub-solar point, in the same world space three-globe
 * uses for its geometry (phi = 90-lat, theta = 90-lng), so lighting lines up with
 * the texture's geography.
 */
export function sunDirection(date: Date): THREE.Vector3 {
  const { lat, lon } = subsolarPoint(date);
  const phi = (90 - lat) * DEG;
  const theta = (90 - lon) * DEG;
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}
