import { describe, it, expect } from 'vitest';
import { angularDistanceDeg } from '../src/geo';

describe('angularDistanceDeg', () => {
  it('is zero for the same point', () => {
    expect(angularDistanceDeg(48, 2, 48, 2)).toBeCloseTo(0, 6);
  });
  it('is 90° a quarter way round the equator', () => {
    expect(angularDistanceDeg(0, 0, 0, 90)).toBeCloseTo(90, 6);
  });
  it('is 180° across the equator', () => {
    expect(angularDistanceDeg(0, 0, 0, 180)).toBeCloseTo(180, 6);
  });
  it('is 180° pole to pole', () => {
    expect(angularDistanceDeg(90, 0, -90, 0)).toBeCloseTo(180, 6);
  });
});
