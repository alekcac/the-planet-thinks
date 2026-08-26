import type { EditorType } from './types';

// Hashing a string into a hue works well across ~300 language codes, but it has no
// idea which strings need to be told apart. "create" and "delete" happen to land one
// degree from each other, which made two of the three OpenStreetMap actions the same
// orange. Where the meaning is fixed and small, so is the palette.
const FIXED_HUES: Record<string, number> = {
  create: 140, // green — something new exists
  modify: 210, // blue — something changed
  delete: 5,   // red — something is gone
};

export function hueFor(lang: string): number {
  const fixed = FIXED_HUES[lang];
  if (fixed !== undefined) return fixed;
  let h = 0;
  for (const c of lang) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function colorFor(lang: string, editor: EditorType, alpha = 1): string {
  if (editor === 'bot') return `hsla(0,0%,55%,${alpha})`;
  const saturation = editor === 'anon' ? 30 : 75;
  return `hsla(${hueFor(lang)},${saturation}%,65%,${alpha})`;
}

export function radiusFor(sizeDelta: number): number {
  return Math.min(6, 1.5 + Math.log2(Math.abs(sizeDelta) + 1) * 0.45);
}

/** Solid HSL string (no alpha) for THREE.Color — used to tint the glow sprites. */
export function hslColor(lang: string, editor: EditorType): string {
  if (editor === 'bot') return 'hsl(0, 0%, 72%)';
  const saturation = editor === 'anon' ? 35 : 82;
  return `hsl(${hueFor(lang)}, ${saturation}%, 68%)`;
}
