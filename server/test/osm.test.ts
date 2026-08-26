import { describe, it, expect } from 'vitest';
import { diffUrl, parseSequence, parseOsmChange } from '../src/osm.js';

describe('diffUrl', () => {
  it('splits the sequence into the three path segments', () => {
    expect(diffUrl(7259608)).toBe('https://planet.openstreetmap.org/replication/minute/007/259/608.osc.gz');
  });
  it('pads short sequences', () => {
    expect(diffUrl(1, 'https://x')).toBe('https://x/000/000/001.osc.gz');
  });
});

describe('parseSequence', () => {
  it('reads the number out of the properties file', () => {
    expect(parseSequence('#Wed Aug 26\nsequenceNumber=7259608\ntimestamp=2026-08-26T13\\:02\\:05Z')).toBe(7259608);
  });
  it('returns null when the file is not what we expected', () => {
    expect(parseSequence('<html>302 Found</html>')).toBeNull();
  });
});

const DIFF = `<?xml version='1.0' encoding='UTF-8'?>
<osmChange version="0.6" generator="osmdbt-create-diff/0.9">
  <modify>
    <node id="1" version="2" uid="7" user="Aki" changeset="900" lat="59.0" lon="21.0"/>
    <node id="2" version="2" uid="7" user="Aki" changeset="900" lat="61.0" lon="23.0"/>
  </modify>
  <create>
    <node id="3" version="1" uid="8" user="Mo" changeset="901" lat="10.0" lon="20.0"/>
  </create>
</osmChange>`;

describe('parseOsmChange', () => {
  it('folds nodes into one changeset each, at the middle of what they touched', () => {
    const rows = parseOsmChange(DIFF, 1000).sort((a, b) => a.id - b.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 900, user: 'Aki', action: 'modify', lat: 60, lon: 22, nodes: 2, ts: 1000 });
    expect(rows[1]).toMatchObject({ id: 901, user: 'Mo', action: 'create', nodes: 1 });
  });
  it('ignores coordinates that cannot be real', () => {
    const bad = '<modify><node id="1" user="x" changeset="5" lat="999" lon="0"/></modify>';
    expect(parseOsmChange(bad)).toHaveLength(0);
  });
  it('survives a document with no nodes at all', () => {
    expect(parseOsmChange('<osmChange><modify><way id="4"/></modify></osmChange>')).toEqual([]);
  });
});
