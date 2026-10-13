import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeApi, resetApiProbe } from './apiMode';

/** Minimal /health body the probe accepts as "this is samity-api". */
function healthOk(mode: 'demo' | 'live' = 'demo') {
  return { ok: true, status: 200, json: async () => ({ status: 'ok', service: 'samity-api', mode }) };
}

/** A request that only settles when its signal aborts — a sleeping API host. */
function hang(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

/**
 * A free container host stops an idle instance and holds the next request while
 * it boots. That is a timeout, not a refusal, so the probe gives it one longer
 * attempt instead of declaring the API unreachable — otherwise every first
 * visit to the deployed site after a quiet period shows the red screen.
 */
describe('probeApi cold-start handling', () => {
  beforeEach(() => {
    resetApiProbe();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetApiProbe();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries with a longer budget when the first attempt times out', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(hang)
      .mockResolvedValueOnce(healthOk('demo'));
    vi.stubGlobal('fetch', fetchMock);

    const pending = probeApi();
    await vi.advanceTimersByTimeAsync(10_000); // first attempt gives up
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.reachable).toBe(true);
    expect(result.mode).toBe('demo');
  });

  it('does not retry when the host refuses the connection', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeApi();

    // A refusal is immediate and final — spending another 45s would only make
    // a genuinely dead API slow to report.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/Failed to fetch/);
  });

  it('reports the long-budget timeout with a starting-up hint', async () => {
    const fetchMock = vi.fn().mockImplementation(hang);
    vi.stubGlobal('fetch', fetchMock);

    const pending = probeApi();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(45_000);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.reachable).toBe(false);
    expect(result.error).toMatch(/Timed out after 45s/);
    expect(result.error).toMatch(/still be starting/);
  });
});
