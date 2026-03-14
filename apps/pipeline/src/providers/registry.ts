import type { PipelineConfig } from '../config/env';
import { FixturePriceSourceProvider } from './fixture-source';
import { TcgdexPriceSourceProvider } from './tcgdex-source';
import type { PriceSourceProvider } from './types';

export function createProviderRegistry(cfg: PipelineConfig): Record<string, PriceSourceProvider> {
  return {
    fixture: new FixturePriceSourceProvider(),
    tcgdex: new TcgdexPriceSourceProvider(cfg.tcgdex)
  };
}
