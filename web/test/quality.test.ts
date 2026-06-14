import { describe, it, expect } from 'vitest';
import { qualityFor } from '../src/quality';

describe('qualityFor', () => {
  it('full quality on desktop', () => {
    expect(qualityFor(1440, false)).toEqual({ pixelRatioCap: 2, maxPoints: 250, maxRings: 24, hexRes: 3 });
  });
  it('reduced quality on small screens', () => {
    expect(qualityFor(390, false).maxPoints).toBe(80);
  });
  it('coarse pointer forces reduced quality regardless of width', () => {
    expect(qualityFor(1024, true).pixelRatioCap).toBe(1.5);
  });
});
