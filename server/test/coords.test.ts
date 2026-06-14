import { describe, it, expect, vi, afterEach } from 'vitest';
import { CoordsResolver } from '../src/coords.js';

const apiResponse = {
  query: {
    pages: [
      { pageid: 9202, title: 'Eiffel Tower', coordinates: [{ lat: 48.8583, lon: 2.2944, primary: true }] },
      { pageid: 23501, title: 'Phlogiston' },
    ],
  },
};

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.useRealTimers());

describe('CoordsResolver', () => {
  it('batches titles per wiki, resolves coords, caches results', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async (_url: unknown, _init?: RequestInit) => okJson(apiResponse));
    const r = new CoordsResolver({ userAgent: 'test', flushMs: 50, fetchFn: fetchFn as unknown as typeof fetch });

    const p1 = r.resolve('en.wikipedia.org', 'Eiffel Tower');
    const p2 = r.resolve('en.wikipedia.org', 'Phlogiston');
    await vi.advanceTimersByTimeAsync(60);

    expect(await p1).toEqual({ lat: 48.8583, lon: 2.2944 });
    expect(await p2).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = fetchFn.mock.calls[0]![1]!.body as URLSearchParams;
    expect(body.get('titles')).toBe('Eiffel Tower|Phlogiston');
    expect(String(fetchFn.mock.calls[0]![0])).toBe('https://en.wikipedia.org/w/api.php');

    // cache hits do not refetch
    expect(await r.resolve('en.wikipedia.org', 'Eiffel Tower')).toEqual({ lat: 48.8583, lon: 2.2944 });
    expect(await r.resolve('en.wikipedia.org', 'Phlogiston')).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately when the batch is full', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => okJson({ query: { pages: [] } }));
    const r = new CoordsResolver({ userAgent: 'test', flushMs: 10_000, maxBatch: 2, fetchFn: fetchFn as unknown as typeof fetch });
    const p1 = r.resolve('en.wikipedia.org', 'A');
    const p2 = r.resolve('en.wikipedia.org', 'B');
    await vi.advanceTimersByTimeAsync(0);
    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries failed batches and gives up after maxAttempts', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => { throw new Error('network'); });
    const r = new CoordsResolver({ userAgent: 'test', flushMs: 10, maxAttempts: 2, fetchFn: fetchFn as unknown as typeof fetch });
    const p = r.resolve('en.wikipedia.org', 'Eiffel Tower');
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('dump/load round-trips the cache', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => okJson(apiResponse));
    const a = new CoordsResolver({ userAgent: 'test', flushMs: 10, fetchFn: fetchFn as unknown as typeof fetch });
    const p = a.resolve('en.wikipedia.org', 'Eiffel Tower');
    await vi.advanceTimersByTimeAsync(20);
    await p;
    const b = new CoordsResolver({ userAgent: 'test', fetchFn: fetchFn as unknown as typeof fetch });
    b.load(a.dump());
    expect(await b.resolve('en.wikipedia.org', 'Eiffel Tower')).toEqual({ lat: 48.8583, lon: 2.2944 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
