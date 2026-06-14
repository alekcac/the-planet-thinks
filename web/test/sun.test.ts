import { describe, it, expect } from 'vitest';
import { subsolarPoint } from '../src/sun';

describe('subsolarPoint', () => {
  it('sits near the prime meridian at noon UTC', () => {
    const p = subsolarPoint(new Date('2026-03-20T12:00:00Z'));
    expect(p.lon).toBeCloseTo(0, 5);
  });
  it('moves 15° west per hour after noon', () => {
    const p = subsolarPoint(new Date('2026-03-20T18:00:00Z'));
    expect(p.lon).toBeCloseTo(-90, 5);
  });
  it('is on the far side at midnight UTC', () => {
    const p = subsolarPoint(new Date('2026-03-20T00:00:00Z'));
    expect(p.lon).toBeCloseTo(180, 5);
  });
  it('tilts toward the northern hemisphere at the june solstice', () => {
    const p = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
    expect(p.lat).toBeGreaterThan(20);
  });
  it('tilts south at the december solstice', () => {
    const p = subsolarPoint(new Date('2026-12-21T12:00:00Z'));
    expect(p.lat).toBeLessThan(-20);
  });
});
