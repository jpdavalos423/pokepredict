import type { RawPriceRecord, StartRunResult } from '@pokepredict/shared';
import type { PriceSourceFetchResult, PriceSourceProvider } from './types';

const BASE_FIXTURE_ROWS: Array<{
  sourceCardId: string;
  marketPrice: number;
  lowPrice?: number;
  highPrice?: number;
}> = [
  { sourceCardId: 'sv3-198', marketPrice: 112.34, lowPrice: 98.0, highPrice: 130.0 },
  { sourceCardId: 'sv3-169', marketPrice: 54.25, lowPrice: 44.5, highPrice: 61.0 },
  { sourceCardId: 'swsh12-TG30', marketPrice: 78.15, lowPrice: 70.0, highPrice: 90.0 },
  { sourceCardId: 'sv2-203', marketPrice: 121.75, lowPrice: 112.0, highPrice: 140.0 },
  { sourceCardId: 'base1-4', marketPrice: 599.99, lowPrice: 550.0, highPrice: 660.0 },
  { sourceCardId: 'unknown-card-001', marketPrice: 12.0, lowPrice: 9.0, highPrice: 14.0 }
];

export class FixturePriceSourceProvider implements PriceSourceProvider {
  async fetch(context: StartRunResult): Promise<PriceSourceFetchResult> {
    const records = BASE_FIXTURE_ROWS.map((row) => {
      const record: RawPriceRecord = {
        sourceCardId: row.sourceCardId,
        recordedAt: context.asOf,
        marketPrice: row.marketPrice,
        currency: 'USD'
      };

      if (row.lowPrice !== undefined) {
        record.lowPrice = row.lowPrice;
      }

      if (row.highPrice !== undefined) {
        record.highPrice = row.highPrice;
      }

      return record;
    });

    return {
      records,
      metrics: {
        totalCardsScanned: BASE_FIXTURE_ROWS.length,
        cardsWithDetailFetched: BASE_FIXTURE_ROWS.length,
        cardsSuccessfullyMapped: records.length,
        cardsSkipped: 0,
        skipReasonCounts: {},
        requestFailures: 0,
        retryCount: 0,
        upstreamFailureRate: 0,
        runDurationMs: 0
      }
    };
  }
}
