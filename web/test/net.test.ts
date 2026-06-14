import { describe, it, expect, vi } from 'vitest';
import { parseMessage, connect } from '../src/net';

describe('connect referrer handling', () => {
  it('sends ?ref on first connect and strips it on reconnect', () => {
    const urls: string[] = [];
    let lastClose: (() => void) | undefined;
    class FakeWS {
      onopen?: () => void;
      onmessage?: (e: { data: string }) => void;
      onclose?: () => void;
      onerror?: () => void;
      constructor(u: string) {
        urls.push(u);
        lastClose = () => this.onclose?.();
      }
      close() { this.onclose?.(); }
    }
    vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket);
    vi.useFakeTimers();
    try {
      connect('wss://api.example.com/ws?ref=news.ycombinator.com', () => {}, () => {});
      lastClose!();            // first connection drops -> schedules a reconnect
      vi.advanceTimersByTime(1000);
      expect(urls[0]).toBe('wss://api.example.com/ws?ref=news.ycombinator.com');
      expect(urls[1]).toBe('wss://api.example.com/ws');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

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
