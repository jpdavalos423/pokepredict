import { describe, expect, it, vi } from 'vitest';
import {
  TcgdexPriceSourceProvider,
  type TcgdexProviderOptions
} from '../src/providers/tcgdex-source';

function createOptions(overrides: Partial<TcgdexProviderOptions> = {}): TcgdexProviderOptions {
  return {
    baseUrl: 'https://api.tcgdex.net/v2/en',
    listPath: '/cards',
    setsPath: '/sets',
    detailPathTemplate: '/cards/{id}',
    excludedSeriesIds: ['tcgp'],
    pageSize: 2,
    maxPages: 0,
    detailConcurrency: 2,
    maxRetries: 2,
    retryBaseDelayMs: 250,
    requestTimeoutMs: 2000,
    failureRateThreshold: 0.9,
    ...overrides
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function isSetsRequest(href: string): boolean {
  const parsed = new URL(href);
  return parsed.pathname.endsWith('/sets');
}

function isSeriesRequest(href: string): boolean {
  const parsed = new URL(href);
  return parsed.pathname.includes('/series/');
}

function defaultSetsResponse(): Response {
  return jsonResponse(200, [
    { id: 'sv3', serie: { id: 'sv' } },
    { id: 'sv2', serie: { id: 'sv' } },
    { id: 'A1', serie: { id: 'tcgp' } }
  ]);
}

function defaultSeriesResponse(): Response {
  return jsonResponse(200, {
    id: 'tcgp',
    sets: [{ id: 'A1' }]
  });
}

function defaultScopeResponse(href: string): Response | undefined {
  if (isSeriesRequest(href)) {
    return defaultSeriesResponse();
  }
  if (isSetsRequest(href)) {
    return defaultSetsResponse();
  }
  return undefined;
}

describe('tcgdex provider', () => {
  it('paginates list responses and fetches card details', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      calls.push(href);

      const scopeResponse = defaultScopeResponse(href);
      if (scopeResponse) {
        return scopeResponse;
      }

      if (href.includes('/cards?') && href.includes('page=1')) {
        return jsonResponse(200, {
          cards: [{ id: 'sv3-198' }, { id: 'sv3-169' }],
          pagination: { page: 1, totalPages: 2 }
        });
      }

      if (href.includes('/cards?') && href.includes('page=2')) {
        return jsonResponse(200, {
          cards: [{ id: 'sv2-203' }],
          pagination: { page: 2, totalPages: 2 }
        });
      }

      if (href.endsWith('/cards/sv3-198')) {
        return jsonResponse(200, {
          id: 'sv3-198',
          pricing: { tcgplayer: { updated: '2026-03-09T00:00:00.000Z', normal: { marketPrice: 100 } } }
        });
      }

      if (href.endsWith('/cards/sv3-169')) {
        return jsonResponse(200, {
          id: 'sv3-169',
          pricing: { tcgplayer: { updated: '2026-03-09T00:00:00.000Z', normal: { marketPrice: 90 } } }
        });
      }

      if (href.endsWith('/cards/sv2-203')) {
        return jsonResponse(200, {
          id: 'sv2-203',
          pricing: { tcgplayer: { updated: '2026-03-09T00:00:00.000Z', normal: { marketPrice: 80 } } }
        });
      }

      return jsonResponse(404, { message: 'not found' });
    });

    const provider = new TcgdexPriceSourceProvider(createOptions(), {
      fetchImpl,
      sleep: async () => {},
      random: () => 0,
      nowMs: (() => {
        let tick = 0;
        return () => {
          tick += 10;
          return tick;
        };
      })()
    });

    const result = await provider.fetch({
      runId: 'run_123',
      asOf: '2026-03-10T06:00:00.000Z',
      source: 'tcgdex',
      mode: 'manual',
      startedAt: '2026-03-10T06:00:00.000Z'
    });

    expect(result.records).toHaveLength(3);
    expect(result.metrics.totalCardsScanned).toBe(3);
    expect(result.metrics.cardsWithDetailFetched).toBe(3);
    expect(calls.filter((href) => href.includes('/cards?'))).toHaveLength(2);
    expect(calls.some((href) => href.includes('/v2/en/cards?'))).toBe(true);
  });

  it('enforces bounded concurrency for detail requests', async () => {
    const cardIds = Array.from({ length: 10 }, (_, index) => `sv3-${index + 1}`);
    let active = 0;
    let maxActive = 0;

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      const scopeResponse = defaultScopeResponse(href);
      if (scopeResponse) {
        return scopeResponse;
      }
      if (href.includes('/cards?')) {
        return jsonResponse(200, {
          cards: cardIds.map((id) => ({ id })),
          pagination: { page: 1, hasNextPage: false }
        });
      }

      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;

      const cardId = href.split('/').at(-1) ?? 'sv3-1';
      return jsonResponse(200, {
        id: cardId,
        pricing: {
          tcgplayer: {
            updated: '2026-03-09T00:00:00.000Z',
            normal: { marketPrice: 100 }
          }
        }
      });
    });

    const provider = new TcgdexPriceSourceProvider(
      createOptions({ pageSize: 20, detailConcurrency: 3 }),
      {
        fetchImpl,
        sleep: async () => {},
        random: () => 0
      }
    );

    const result = await provider.fetch({
      runId: 'run_concurrency',
      asOf: '2026-03-10T06:00:00.000Z',
      source: 'tcgdex',
      mode: 'manual',
      startedAt: '2026-03-10T06:00:00.000Z'
    });

    expect(result.records).toHaveLength(10);
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it('retries transient failures with exponential backoff and jitter', async () => {
    const detailAttempts = new Map<string, number>();
    const sleepDelays: number[] = [];

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      const scopeResponse = defaultScopeResponse(href);
      if (scopeResponse) {
        return scopeResponse;
      }
      if (href.includes('/cards?')) {
        return jsonResponse(200, {
          cards: [{ id: 'sv3-198' }],
          pagination: { page: 1, hasNextPage: false }
        });
      }

      const attempts = (detailAttempts.get(href) ?? 0) + 1;
      detailAttempts.set(href, attempts);
      if (attempts < 3) {
        return jsonResponse(500, { message: 'temporary upstream error' });
      }

      return jsonResponse(200, {
        id: 'sv3-198',
        pricing: {
          tcgplayer: {
            updated: '2026-03-09T00:00:00.000Z',
            normal: { marketPrice: 105 }
          }
        }
      });
    });

    const provider = new TcgdexPriceSourceProvider(createOptions(), {
      fetchImpl,
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
      random: () => 0
    });

    const result = await provider.fetch({
      runId: 'run_retry',
      asOf: '2026-03-10T06:00:00.000Z',
      source: 'tcgdex',
      mode: 'manual',
      startedAt: '2026-03-10T06:00:00.000Z'
    });

    expect(result.records).toHaveLength(1);
    expect(result.metrics.retryCount).toBe(2);
    expect(sleepDelays).toEqual([250, 500]);
  });

  it('continues run on isolated detail failures without retrying permanent 4xx responses', async () => {
    let missingCardCalls = 0;

    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      const scopeResponse = defaultScopeResponse(href);
      if (scopeResponse) {
        return scopeResponse;
      }
      if (href.includes('/cards?')) {
        return jsonResponse(200, {
          cards: [{ id: 'sv3-198' }, { id: 'missing-card' }],
          pagination: { page: 1, hasNextPage: false }
        });
      }

      if (href.endsWith('/cards/missing-card')) {
        missingCardCalls += 1;
        return jsonResponse(404, { message: 'card not found' });
      }

      return jsonResponse(200, {
        id: 'sv3-198',
        pricing: {
          tcgplayer: {
            updated: '2026-03-09T00:00:00.000Z',
            normal: { marketPrice: 99 }
          }
        }
      });
    });

    const provider = new TcgdexPriceSourceProvider(
      createOptions({ failureRateThreshold: 0.99 }),
      {
        fetchImpl,
        sleep: async () => {},
        random: () => 0
      }
    );

    const result = await provider.fetch({
      runId: 'run_partial_failures',
      asOf: '2026-03-10T06:00:00.000Z',
      source: 'tcgdex',
      mode: 'manual',
      startedAt: '2026-03-10T06:00:00.000Z'
    });

    expect(result.records).toHaveLength(1);
    expect(result.metrics.requestFailures).toBe(1);
    expect(result.metrics.retryCount).toBe(0);
    expect(missingCardCalls).toBe(1);
  });

  it('filters tcgp cards using excluded set metadata and records skip reason', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (isSeriesRequest(href)) {
        return jsonResponse(200, {
          id: 'tcgp',
          sets: [{ id: 'A1' }]
        });
      }
      if (isSetsRequest(href)) {
        return jsonResponse(200, [{ id: 'sv3', serie: { id: 'sv' } }]);
      }

      if (href.includes('/cards?')) {
        return jsonResponse(200, {
          cards: [{ id: 'A1-001' }, { id: 'sv3-198' }],
          pagination: { page: 1, hasNextPage: false }
        });
      }

      if (href.endsWith('/cards/sv3-198')) {
        return jsonResponse(200, {
          id: 'sv3-198',
          set: { id: 'sv3' },
          pricing: {
            tcgplayer: {
              updated: '2026-03-09T00:00:00.000Z',
              normal: { marketPrice: 100 }
            }
          }
        });
      }

      return jsonResponse(404, { message: 'not found' });
    });

    const provider = new TcgdexPriceSourceProvider(createOptions(), {
      fetchImpl,
      sleep: async () => {},
      random: () => 0
    });

    const result = await provider.fetch({
      runId: 'run_scope_filter',
      asOf: '2026-03-10T06:00:00.000Z',
      source: 'tcgdex',
      mode: 'manual',
      startedAt: '2026-03-10T06:00:00.000Z'
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.sourceCardId).toBe('sv3-198');
    expect(result.metrics.totalCardsScanned).toBe(2);
    expect(result.metrics.skipReasonCounts['excluded out-of-scope set']).toBe(1);
    expect(result.metrics.cardsWithDetailFetched).toBe(1);
  });

  it('fails closed when excluded series set lookup does not resolve', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (isSeriesRequest(href)) {
        return jsonResponse(500, { message: 'series lookup failed' });
      }
      if (isSetsRequest(href)) {
        return jsonResponse(200, [{ id: 'sv3', serie: { id: 'sv' } }]);
      }
      return jsonResponse(500, { message: 'unexpected request' });
    });

    const provider = new TcgdexPriceSourceProvider(createOptions(), {
      fetchImpl,
      sleep: async () => {},
      random: () => 0
    });

    await expect(
      provider.fetch({
        runId: 'run_scope_fail_closed',
        asOf: '2026-03-10T06:00:00.000Z',
        source: 'tcgdex',
        mode: 'manual',
        startedAt: '2026-03-10T06:00:00.000Z'
      })
    ).rejects.toThrow(/Failed to resolve TCGdex excluded set IDs/);
  });
});
