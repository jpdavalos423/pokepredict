import type { RawPriceRecord, StartRunResult } from '@pokepredict/shared';

export interface PriceSourceFetchMetrics {
  totalCardsScanned: number;
  cardsWithDetailFetched: number;
  cardsSuccessfullyMapped: number;
  cardsSkipped: number;
  skipReasonCounts: Record<string, number>;
  requestFailures: number;
  retryCount: number;
  upstreamFailureRate: number;
  runDurationMs: number;
}

export interface PriceSourceFetchResult {
  records: RawPriceRecord[];
  metrics: PriceSourceFetchMetrics;
}

export interface PriceSourceProvider {
  fetch(context: StartRunResult): Promise<PriceSourceFetchResult>;
}
