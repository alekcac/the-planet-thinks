import { describe, it, expect } from 'vitest';
import { pitchFor, newArticleInterval } from '../src/sound';

describe('pitchFor', () => {
  it('small edits ring higher than large ones', () => {
    expect(pitchFor(1)).toBeGreaterThan(pitchFor(10_000));
  });
  it('is bounded by the scale', () => {
    expect(pitchFor(0)).toBe(1046.5);
    expect(pitchFor(1e12)).toBe(392);
  });
});

describe('newArticleInterval', () => {
  it('rises by a perfect fifth from the edit-size note', () => {
    const [root, fifth] = newArticleInterval(500);
    expect(root).toBe(pitchFor(500));
    expect(fifth / root).toBeCloseTo(1.5, 5);
  });
  it('stays keyed to edit size, so a big new article opens lower', () => {
    expect(newArticleInterval(1)[0]).toBeGreaterThan(newArticleInterval(10_000)[0]);
  });
});
