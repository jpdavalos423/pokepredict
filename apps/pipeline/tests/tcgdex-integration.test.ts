import type { RawFetchPayload, StartRunResult } from '@pokepredict/shared';
import { describe, expect, it } from 'vitest';
import { createFetchRawHandler } from '../src/handlers/fetchRaw';
import { createNormalizeHandler } from '../src/handlers/normalize';
import {
  TcgdexPriceSourceProvider,
  type TcgdexProviderOptions
} from '../src/providers/tcgdex-source';

const CARD_IDS = [
  'sv3-198',
  'sv3-169',
  'swsh12-TG30',
  'sv2-203',
  'base1-4',
  'sv9-999'
];

const KNOWN_CARD_IDS = new Set(['sv3-198', 'sv3-169', 'swsh12-TG30', 'sv2-203', 'base1-4']);

function createProviderOptions(): TcgdexProviderOptions {
  return {
    baseUrl: 'https://api.tcgdex.net/v2/en',
    listPath: '/cards',
    detailPathTemplate: '/cards/{id}',
    pageSize: 3,
    maxPages: 0,
    detailConcurrency: 3,
    maxRetries: 2,
    retryBaseDelayMs: 250,
    requestTimeoutMs: 2000,
    failureRateThreshold: 0.9
  };
}

function createTcgdexFetch(
  asOf: string,
  pricesByCard: Record<string, number>
): (url: string | URL) => Promise<Response> {
  return async (url: string | URL) => {
    const parsedUrl = new URL(String(url));
    if (parsedUrl.pathname.endsWith('/cards')) {
      const pageParam = parsedUrl.searchParams.get('page') ?? parsedUrl.searchParams.get('pagination:page') ?? '1';
      const page = Number.parseInt(pageParam, 10);
      const chunk = page === 1 ? CARD_IDS.slice(0, 3) : CARD_IDS.slice(3);

      return new Response(
        JSON.stringify({
          cards: chunk.map((id) => ({ id })),
          pagination: { page, totalPages: 2 }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    const cardId = decodeURIComponent(parsedUrl.pathname.split('/').at(-1) ?? '');
    const marketPrice = pricesByCard[cardId];
    if (marketPrice === undefined) {
      return new Response(JSON.stringify({ message: 'missing fixture card price' }), { status: 404 });
    }

    return new Response(
      JSON.stringify({
        id: cardId,
        pricing: {
          tcgplayer: {
            updated: asOf,
            normal: {
              marketPrice,
              lowPrice: marketPrice - 5,
              highPrice: marketPrice + 5
            }
          }
        }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
}

describe('tcgdex ingestion integration', () => {
  it('ingests sample tcgdex dataset, keeps normalize skip ratio below threshold, and appends history snapshots', async () => {
    const run1: StartRunResult = {
      runId: 'run_tcgdex_1',
      asOf: '2026-03-10T06:00:00.000Z',
      source: 'tcgdex',
      mode: 'manual',
      startedAt: '2026-03-10T06:00:00.000Z'
    };

    const run2: StartRunResult = {
      runId: 'run_tcgdex_2',
      asOf: '2026-03-11T06:00:00.000Z',
      source: 'tcgdex',
      mode: 'manual',
      startedAt: '2026-03-11T06:00:00.000Z'
    };

    const providerRun1 = new TcgdexPriceSourceProvider(createProviderOptions(), {
      fetchImpl: createTcgdexFetch(run1.asOf, {
        'sv3-198': 100,
        'sv3-169': 80,
        'swsh12-TG30': 60,
        'sv2-203': 120,
        'base1-4': 500,
        'sv9-999': 20
      }),
      sleep: async () => {},
      random: () => 0
    });

    const providerRun2 = new TcgdexPriceSourceProvider(createProviderOptions(), {
      fetchImpl: createTcgdexFetch(run2.asOf, {
        'sv3-198': 110,
        'sv3-169': 82,
        'swsh12-TG30': 63,
        'sv2-203': 118,
        'base1-4': 520,
        'sv9-999': 21
      }),
      sleep: async () => {},
      random: () => 0
    });

    const rawPayloadByKey = new Map<string, RawFetchPayload>();
    const pricePoints = new Map<string, { cardId: string; ts: string; marketCents: number }>();
    const latestAsOfByCard = new Map<string, string>();
    const latestByCard = new Map<string, { asOf: string; marketCents: number }>();

    const normalizeHandler = createNormalizeHandler({
      now: () => '2026-03-12T00:00:00.000Z',
      readRawPayload: async (rawS3Key) => {
        const payload = rawPayloadByKey.get(rawS3Key);
        if (!payload) {
          throw new Error(`Missing payload for ${rawS3Key}`);
        }
        return payload;
      },
      cardExists: async (cardId) => KNOWN_CARD_IDS.has(cardId),
      putPricePoint: async (record) => {
        pricePoints.set(`${record.cardId}#${record.ts}`, {
          cardId: record.cardId,
          ts: record.ts,
          marketCents: record.marketCents
        });
      },
      getLatestAsOf: async (cardId) => latestAsOfByCard.get(cardId),
      upsertLatestPrice: async (record, asOf) => {
        latestAsOfByCard.set(record.cardId, asOf);
        latestByCard.set(record.cardId, { asOf, marketCents: record.marketCents });
        return true;
      }
    });

    const fetchRun1 = createFetchRawHandler({
      now: () => '2026-03-10T06:05:00.000Z',
      fetchFromSource: async (input) => providerRun1.fetch(input),
      putRawPayload: async (key, payload) => {
        rawPayloadByKey.set(key, payload);
      }
    });
    const fetchRun2 = createFetchRawHandler({
      now: () => '2026-03-11T06:05:00.000Z',
      fetchFromSource: async (input) => providerRun2.fetch(input),
      putRawPayload: async (key, payload) => {
        rawPayloadByKey.set(key, payload);
      }
    });

    const rawResult1 = await fetchRun1(run1);
    const normalizeResult1 = await normalizeHandler(rawResult1);
    const rawResult2 = await fetchRun2(run2);
    const normalizeResult2 = await normalizeHandler(rawResult2);

    expect(normalizeResult1.processedCount).toBe(5);
    expect(normalizeResult2.processedCount).toBe(5);
    expect(normalizeResult1.updatedCardIds).toHaveLength(5);
    expect(normalizeResult2.updatedCardIds).toHaveLength(5);

    const historyEntriesForSv3198 = [...pricePoints.values()].filter(
      (entry) => entry.cardId === 'sv3-198'
    );
    expect(historyEntriesForSv3198).toHaveLength(2);
    expect(
      historyEntriesForSv3198.map((entry) => entry.ts).sort()
    ).toEqual([run1.asOf, run2.asOf]);

    expect(latestByCard.get('sv3-198')).toEqual({
      asOf: run2.asOf,
      marketCents: 11000
    });
  });
});
