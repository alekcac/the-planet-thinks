import { describe, it, expect } from 'vitest';
import { parseMessage } from '../src/net';

describe('parseMessage', () => {
  it('accepts known message types', () => {
    const pulse = { type: 'pulse', lat: 1, lon: 2, lang: 'en', title: 't', url: 'u', editor_type: 'user', size_delta: 5, ts: 1 };
    expect(parseMessage(JSON.stringify(pulse))).toMatchObject({ type: 'pulse', lang: 'en' });
    expect(parseMessage('{"type":"stats","total_rate":1,"geo_rate":0,"by_lang":{}}')!.type).toBe('stats');
    expect(parseMessage('{"type":"replay","events":[]}')!.type).toBe('replay');
  });
  it('rejects garbage and unknown types', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage('{"type":"nope"}')).toBeNull();
  });
});
