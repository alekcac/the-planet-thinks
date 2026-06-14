import { describe, it, expect } from 'vitest';
import { colorFor, hueFor, radiusFor } from '../src/visuals';

describe('visuals', () => {
  it('hue is deterministic per language', () => {
    expect(hueFor('en')).toBe(hueFor('en'));
    expect(hueFor('en')).not.toBe(hueFor('ja'));
  });
  it('bots are gray regardless of language', () => {
    expect(colorFor('en', 'bot')).toContain('hsla(0,0%');
  });
  it('alpha is applied', () => {
    expect(colorFor('en', 'user', 0.5)).toContain('0.5)');
  });
  it('radius grows with edit size and is capped', () => {
    expect(radiusFor(0)).toBe(1.5);
    expect(radiusFor(100)).toBeGreaterThan(radiusFor(10));
    expect(radiusFor(1e9)).toBe(6);
  });
});
