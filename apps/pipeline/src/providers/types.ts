import type { RawPriceRecord, StartRunResult } from '@pokepredict/shared';

export interface PriceSourceProvider {
  fetch(context: StartRunResult): Promise<RawPriceRecord[]>;
}
