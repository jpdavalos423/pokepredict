import { describe, expect, it } from 'vitest';
import type {
  FetchRawResult,
  NormalizedPriceRecord,
  RawFetchPayload
} from '@pokepredict/shared';
import { isIncomingAsOfNewer } from '../src/handlers/common';
import {
  buildLatestPriceUpdate,
  buildPricePointItem,
  createNormalizeHandler
} from '../src/handlers/normalize';

describe('normalize handler', () => {
  it('evaluates latest freshness guard correctly', () => {
    expect(isIncomingAsOfNewer(undefined, '2026-03-04T00:00:00.000Z')).toBe(true);
    expect(
      isIncomingAsOfNewer('2026-03-03T00:00:00.000Z', '2026-03-04T00:00:00.000Z')
    ).toBe(true);
    expect(
      isIncomingAsOfNewer('2026-03-04T00:00:00.000Z', '2026-03-03T00:00:00.000Z')
    ).toBe(false);
  });

  it('normalizes and writes deterministic keys across replay', async () => {
    const prices = new Map<string, NormalizedPriceRecord>();
    const latestAsOf = new Map<string, string>();

    const payload: RawFetchPayload = {
      runId: 'run_123',
      asOf: '2026-03-04T18:00:00.000Z',
      source: 'fixture',
      mode: 'manual',
      records: [
        {
          sourceCardId: 'sv3-198',
          recordedAt: '2026-03-04T18:00:00.000Z',
          marketPrice: 112.34,
          lowPrice: 98,
          highPrice: 130,
          currency: 'USD'
        },
        {
          sourceCardId: 'sv3-169',
          recordedAt: '2026-03-04T18:00:00.000Z',
          marketPrice: 54.25,
          lowPrice: 44.5,
          highPrice: 61,
          currency: 'USD'
        }
      ]
    };

    const handler = createNormalizeHandler({
      now: () => '2026-03-04T18:01:00.000Z',
      readRawPayload: async () => payload,
      cardExists: async (cardId) => cardId !== 'unknown',
      putPricePoint: async (record) => {
        prices.set(`${record.cardId}#${record.ts}`, record);
      },
      getLatestAsOf: async (cardId) => latestAsOf.get(cardId),
      upsertLatestPrice: async (record, asOf) => {
        latestAsOf.set(record.cardId, asOf);
        return true;
      }
    });

    const event: FetchRawResult = {
      runId: 'run_123',
      asOf: '2026-03-04T18:00:00.000Z',
      source: 'fixture',
      mode: 'manual',
      startedAt: '2026-03-04T18:00:00.000Z',
      rawS3Key: 'raw/fixture/2026/03/04/18/run_123.json',
      rawRecordCount: 2,
      fetchedAt: '2026-03-04T18:01:00.000Z'
    };

    const first = await handler(event);
    const second = await handler(event);

    expect(first.processedCount).toBe(2);
    expect(first.updatedCardIds.sort()).toEqual(['sv3-169', 'sv3-198']);

    expect(second.processedCount).toBe(2);
    expect(prices.size).toBe(2);
    expect(latestAsOf.get('sv3-198')).toBe('2026-03-04T18:00:00.000Z');
  });

  it('omits optional low/high cents from price point items when not provided', () => {
    const record: NormalizedPriceRecord = {
      cardId: 'sv3-198',
      ts: '2026-03-04T18:00:00.000Z',
      marketCents: 11234,
      currency: 'USD',
      source: 'fixture',
      runId: 'run_123'
    };

    const item = buildPricePointItem(record, '2026-03-04T18:01:00.000Z');

    expect(item.marketCents).toBe(11234);
    expect(item).not.toHaveProperty('lowCents');
    expect(item).not.toHaveProperty('highCents');
  });

  it('builds latest update without low/high references when incoming values are missing', () => {
    const record: NormalizedPriceRecord = {
      cardId: 'sv3-198',
      ts: '2026-03-04T18:00:00.000Z',
      marketCents: 11234,
      currency: 'USD',
      source: 'fixture',
      runId: 'run_123'
    };

    const update = buildLatestPriceUpdate(
      record,
      '2026-03-04T18:00:00.000Z',
      '2026-03-04T18:01:00.000Z'
    );

    expect(update.UpdateExpression).not.toContain('lowCents = :lowCents');
    expect(update.UpdateExpression).not.toContain('highCents = :highCents');
    expect(update.ExpressionAttributeValues).not.toHaveProperty(':lowCents');
    expect(update.ExpressionAttributeValues).not.toHaveProperty(':highCents');
  });

  it('preserves existing latest low/high semantics by only setting incoming low/high when defined', () => {
    const record: NormalizedPriceRecord = {
      cardId: 'sv3-198',
      ts: '2026-03-04T18:00:00.000Z',
      marketCents: 11234,
      lowCents: 9800,
      highCents: 13000,
      currency: 'USD',
      source: 'fixture',
      runId: 'run_123'
    };

    const update = buildLatestPriceUpdate(
      record,
      '2026-03-04T18:00:00.000Z',
      '2026-03-04T18:01:00.000Z'
    );

    expect(update.UpdateExpression).toContain('lowCents = :lowCents');
    expect(update.UpdateExpression).toContain('highCents = :highCents');
    expect(update.ExpressionAttributeValues[':lowCents']).toBe(9800);
    expect(update.ExpressionAttributeValues[':highCents']).toBe(13000);
  });
});
