import type { CreateHoldingRequest, HoldingResponse, LatestPriceResponse } from '@pokepredict/shared';
import { describe, expect, it } from 'vitest';
import {
  buildHoldingValuation,
  computeHoldingRequestHash,
  summarizePortfolio
} from '../src/routes/portfolio/utils';

describe('portfolio utilities', () => {
  it('computes stable request hash regardless of object key order', () => {
    const left: CreateHoldingRequest = {
      cardId: 'sv3-198',
      qty: 2,
      variant: 'raw',
      grade: null,
      condition: 'NM',
      buyPriceCents: 1000,
      buyDate: '2026-03-01',
      notes: 'test'
    };

    const right = {
      notes: 'test',
      buyDate: '2026-03-01',
      buyPriceCents: 1000,
      condition: 'NM',
      grade: null,
      variant: 'raw',
      qty: 2,
      cardId: 'sv3-198'
    } as CreateHoldingRequest;

    expect(computeHoldingRequestHash(left)).toBe(computeHoldingRequestHash(right));
  });

  it('builds holding valuation with missing latest price as zero market value', () => {
    const holding: HoldingResponse = {
      holdingId: 'h1',
      userId: 'u1',
      cardId: 'sv3-198',
      qty: 2,
      variant: 'raw',
      grade: null,
      condition: 'NM',
      buyPriceCents: 1000,
      buyDate: '2026-03-01',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      version: 1
    };

    const valuation = buildHoldingValuation(holding, null);

    expect(valuation.costBasisCents).toBe(2000);
    expect(valuation.marketValueCents).toBe(0);
    expect(valuation.unrealizedPnLCents).toBe(-2000);
    expect(valuation.unrealizedPnLBps).toBe(-10000);
  });

  it('computes summary and bps from aggregated totals', () => {
    const holding: HoldingResponse = {
      holdingId: 'h2',
      userId: 'u1',
      cardId: 'sv3-169',
      qty: 1,
      variant: 'raw',
      grade: null,
      condition: 'NM',
      buyPriceCents: 1000,
      buyDate: '2026-03-01',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      version: 1
    };

    const latest: LatestPriceResponse = {
      cardId: 'sv3-169',
      asOf: '2026-03-04T00:00:00.000Z',
      marketCents: 1500,
      marketPrice: 15,
      currency: 'USD',
      source: 'fixture'
    };

    const summary = summarizePortfolio([buildHoldingValuation(holding, latest)]);

    expect(summary.totalCostBasisCents).toBe(1000);
    expect(summary.totalMarketValueCents).toBe(1500);
    expect(summary.unrealizedPnLCents).toBe(500);
    expect(summary.unrealizedPnLBps).toBe(5000);
  });
});
