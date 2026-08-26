import { describe, it, expect, beforeAll } from 'vitest';
import { loadCountries, countryAt } from '../src/countries.js';

beforeAll(() => {
  const n = loadCountries(new URL('../assets/countries.json', import.meta.url).pathname);
  expect(n).toBeGreaterThan(150);
});

describe('countryAt', () => {
  it('places well-known points', () => {
    expect(countryAt(48.85, 2.35)).toBe('France');       // Paris
    expect(countryAt(35.68, 139.69)).toBe('Japan');      // Tokyo
    expect(countryAt(-33.86, 151.21)).toBe('Australia'); // Sydney
    expect(countryAt(51.54, 7.33)).toBe('Germany');      // the changeset the card showed
  });
  it('returns null out at sea', () => {
    expect(countryAt(0, -30)).toBeNull();   // middle of the Atlantic
    expect(countryAt(-60, -140)).toBeNull(); // Southern Ocean
  });
  it('says nothing rather than guessing when no data is loaded', () => {
    loadCountries('/nonexistent.json');
    expect(countryAt(48.85, 2.35)).toBeNull();
  });
});
