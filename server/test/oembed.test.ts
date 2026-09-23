import { describe, it, expect } from 'vitest';
import { oembedFor } from '../src/oembed.js';

describe('oembedFor', () => {
  it('describes the globe the link points at', () => {
    const card = oembedFor('https://theplanetthinks.com/map')!;
    expect(card.type).toBe('rich');
    expect(card.title).toContain('OpenStreetMap');
    expect(card.html).toContain('https://theplanetthinks.com/map?cinematic');
    expect(card.width).toBe(800);
    expect(card.height).toBe(450);
  });

  it('treats a trailing slash and index.html as the same page', () => {
    expect(oembedFor('https://theplanetthinks.com/photos/')!.title).toContain('Commons');
    expect(oembedFor('https://www.theplanetthinks.com/index.html')!.title).toContain('Wikipedia');
  });

  it('fits the host column, and lets a height limit win when it is tighter', () => {
    expect(oembedFor('https://theplanetthinks.com/', 400)).toMatchObject({ width: 400, height: 225 });
    // 800 wide would be 450 tall; a 200px ceiling forces the width down to match.
    expect(oembedFor('https://theplanetthinks.com/', 800, 200)).toMatchObject({ width: 356, height: 200 });
    // Never larger than the default, however generous the host is.
    expect(oembedFor('https://theplanetthinks.com/', 5000)!.width).toBe(800);
  });

  it('refuses anything that is not ours to describe', () => {
    expect(oembedFor('https://example.com/')).toBeNull();
    expect(oembedFor('https://theplanetthinks.com/stats')).toBeNull(); // a page, not a globe
    expect(oembedFor('https://evil.test/?u=https://theplanetthinks.com/')).toBeNull();
    expect(oembedFor('not a url')).toBeNull();
    expect(oembedFor('')).toBeNull();
  });
});
