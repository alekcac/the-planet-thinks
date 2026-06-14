import { describe, it, expect } from 'vitest';
import { pitchFor } from '../src/sound';

describe('pitchFor', () => {
  it('small edits ring higher than large ones', () => {
    expect(pitchFor(1)).toBeGreaterThan(pitchFor(10_000));
  });
  it('is bounded by the scale', () => {
    expect(pitchFor(0)).toBe(1046.5);
    expect(pitchFor(1e12)).toBe(392);
  });
});
