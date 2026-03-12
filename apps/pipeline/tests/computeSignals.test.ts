import { describe, expect, it } from 'vitest';
import type { NormalizeResult, PricePoint } from '@pokepredict/shared';
import {
  buildSignalRecord,
  classifyTrend,
  computeReturnBps,
  computeVolatilityBps,
  createComputeSignalsHandler
} from '../src/handlers/computeSignals';

describe('computeSignals math helpers', () => {
  it('computes return bps with positive, negative, and missing baseline cases', () => {
    expect(computeReturnBps(11000, 10000)).toBe(1000);
    expect(computeReturnBps(9000, 10000)).toBe(-1000);
    expect(computeReturnBps(9000, undefined)).toBe(0);
    expect(computeReturnBps(9000, 0)).toBe(0);
  });

  it('computes population volatility and handles insufficient history', () => {
    const points: PricePoint[] = [
      {
        cardId: 'sv3-198',
        ts: '2026-03-01T00:00:00.000Z',
        marketCents: 10000,
        currency: 'USD',
        source: 'fixture'
      },
      {
        cardId: 'sv3-198',
        ts: '2026-03-02T00:00:00.000Z',
        marketCents: 11000,
        currency: 'USD',
        source: 'fixture'
      },
      {
        cardId: 'sv3-198',
        ts: '2026-03-03T00:00:00.000Z',
        marketCents: 9900,
        currency: 'USD',
        source: 'fixture'
      }
    ];

    expect(computeVolatilityBps(points)).toBe(1000);
    expect(computeVolatilityBps(points.slice(0, 2))).toBe(0);
  });

  it('classifies trend boundaries from ret30 bps', () => {
    expect(classifyTrend(299)).toBe('SIDEWAYS');
    expect(classifyTrend(300)).toBe('UPTREND');
    expect(classifyTrend(-299)).toBe('SIDEWAYS');
    expect(classifyTrend(-300)).toBe('DOWNTREND');
  });
});

describe('computeSignals handler', () => {
  it('computes signals with sparse history and skips cards without usable current price', async () => {
    const writes = new Map<string, ReturnType<typeof buildSignalRecord>>();

    const handler = createComputeSignalsHandler({
      now: () => '2026-03-31T01:00:00.000Z',
      listPricePoints: async (cardId) => {
        if (cardId === 'sv3-198') {
          return [
            {
              cardId,
              ts: '2026-03-01T00:00:00.000Z',
              marketCents: 10000,
              currency: 'USD',
              source: 'fixture'
            },
            {
              cardId,
              ts: '2026-03-31T00:00:00.000Z',
              marketCents: 11000,
              currency: 'USD',
              source: 'fixture'
            }
          ];
        }
        return [];
      },
      upsertSignal: async (record) => {
        writes.set(`${record.cardId}#${record.asOfDate}`, record);
      }
    });

    const event: NormalizeResult = {
      runId: 'run_123',
      asOf: '2026-03-31T00:00:00.000Z',
      source: 'fixture',
      mode: 'manual',
      startedAt: '2026-03-31T00:00:00.000Z',
      processedCount: 2,
      updatedCardIds: ['sv3-198', 'sv3-169']
    };

    const first = await handler(event);
    const second = await handler(event);

    expect(first.processedCount).toBe(1);
    expect(first.updatedCardIds).toEqual(['sv3-198']);
    expect(second.processedCount).toBe(1);
    expect(writes.size).toBe(1);

    const signal = writes.get('sv3-198#2026-03-31');
    expect(signal).toBeTruthy();
    expect(signal?.ret30dBps).toBe(1000);
    expect(signal?.ret7dBps).toBe(1000);
    expect(signal?.trend).toBe('UPTREND');
  });

  it('returns null when no current point exists at or before asOf', () => {
    const signal = buildSignalRecord(
      'sv3-198',
      '2026-03-31T00:00:00.000Z',
      'fixture',
      'run_123',
      [
        {
          cardId: 'sv3-198',
          ts: '2026-04-01T00:00:00.000Z',
          marketCents: 10000,
          currency: 'USD',
          source: 'fixture'
        }
      ]
    );

    expect(signal).toBeNull();
  });
});
