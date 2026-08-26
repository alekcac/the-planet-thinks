import { describe, it, expect } from 'vitest';
import { parseCsv, parseGeoJson, parseCustom, pulseFromObject, splitCsvLine, detectDelimiter } from '../src/custom-data';

describe('splitCsvLine', () => {
  it('keeps delimiters that sit inside quotes', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });
  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('"say ""hi""",2', ',')).toEqual(['say "hi"', '2']);
  });
});

describe('detectDelimiter', () => {
  it('picks whichever separator the header actually uses', () => {
    expect(detectDelimiter('lat;lon;name')).toBe(';');
    expect(detectDelimiter('lat\tlon\tname')).toBe('\t');
    expect(detectDelimiter('lat,lon,name')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('reads a plain file and maps the optional columns', () => {
    const r = parseCsv('lat,lon,name,category,weight\n48.85,2.35,Paris,capital,900');
    expect(r.error).toBeUndefined();
    expect(r.points).toHaveLength(1);
    expect(r.points[0]).toMatchObject({
      type: 'pulse', lat: 48.85, lon: 2.35, title: 'Paris', lang: 'capital', size_delta: 900,
    });
  });
  it('accepts latitude/longitude spelled out, and a semicolon file', () => {
    const r = parseCsv('Latitude;Longitude\n-33,86;151,21');
    expect(r.points[0]).toMatchObject({ lat: -33.86, lon: 151.21 });
  });
  it('counts unusable rows instead of failing on them', () => {
    const r = parseCsv('lat,lon\n1,2\nnope,nope\n91,0\n3,4');
    expect(r.points).toHaveLength(2); // 91 is not a latitude
    expect(r.skipped).toBe(2);
  });
  it('explains itself when the location columns are missing', () => {
    const r = parseCsv('city,population\nParis,2000000');
    expect(r.points).toHaveLength(0);
    expect(r.error).toMatch(/latitude and longitude/i);
  });
  it('needs more than a header', () => {
    expect(parseCsv('lat,lon').error).toMatch(/header row/i);
  });
  it('stops at the cap', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `${i % 80},${i}`).join('\n');
    expect(parseCsv('lat,lon\n' + rows, 10).points).toHaveLength(10);
  });
});

describe('parseGeoJson', () => {
  it('reads a FeatureCollection, longitude first', () => {
    const gj = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [2.35, 48.85] }, properties: { name: 'Paris' } }],
    });
    const r = parseGeoJson(gj);
    expect(r.points[0]).toMatchObject({ lat: 48.85, lon: 2.35, title: 'Paris' });
  });
  it('reads a bare array of objects', () => {
    const r = parseGeoJson(JSON.stringify([{ latitude: 10, longitude: 20 }]));
    expect(r.points[0]).toMatchObject({ lat: 10, lon: 20 });
  });
  it('reports invalid JSON plainly', () => {
    expect(parseGeoJson('{oops').error).toMatch(/valid JSON/i);
  });
  it('reports a shape with no coordinates', () => {
    expect(parseGeoJson('{"a":1}').error).toMatch(/no point features/i);
  });
});

describe('pulseFromObject', () => {
  it('returns null when there is no location to draw', () => {
    expect(pulseFromObject({ name: 'nowhere' })).toBeNull();
    expect(pulseFromObject(null)).toBeNull();
    expect(pulseFromObject('string')).toBeNull();
  });
  it('only trusts http(s) links', () => {
    expect(pulseFromObject({ lat: 1, lon: 2, url: 'javascript:alert(1)' })!.url).toBe('');
    expect(pulseFromObject({ lat: 1, lon: 2, url: 'https://example.com' })!.url).toBe('https://example.com');
  });
  it('keeps a category as the colour key, lowercased', () => {
    expect(pulseFromObject({ lat: 1, lon: 2, type: 'Delivered' })!.lang).toBe('delivered');
    expect(pulseFromObject({ lat: 1, lon: 2 })!.lang).toBe('data');
  });
  it('falls back to coordinates for a title', () => {
    expect(pulseFromObject({ lat: 1.23456, lon: 2 })!.title).toBe('1.235, 2.000');
  });
});

describe('parseCustom', () => {
  it('dispatches on the content, not the file name', () => {
    expect(parseCustom('[{"lat":1,"lon":2}]').points).toHaveLength(1);
    expect(parseCustom('lat,lon\n1,2').points).toHaveLength(1);
  });
});
