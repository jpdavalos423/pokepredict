import { afterEach, describe, expect, it } from 'vitest';
import { loadPipelineConfig } from '../src/config/env';

const originalEnv = { ...process.env };

function applyBaseEnv(overrides: Record<string, string | undefined> = {}): void {
  process.env = {
    ...originalEnv,
    RAW_BUCKET: 'raw-bucket',
    SOURCE_NAME: 'tcgdex',
    SES_FROM_EMAIL: 'alerts@example.com',
    TABLE_CARDS: 'Cards',
    TABLE_PRICES: 'Prices',
    TABLE_LATEST_PRICES: 'LatestPrices',
    TABLE_SIGNALS: 'Signals',
    TABLE_ALERTS_BY_USER: 'AlertsByUser',
    TABLE_ALERTS_BY_CARD: 'AlertsByCard',
    ...overrides
  };
}

describe('pipeline env config', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults excluded series IDs to tcgp when unset', () => {
    applyBaseEnv({
      TCGDEX_EXCLUDED_SERIES_IDS: undefined
    });

    const cfg = loadPipelineConfig();
    expect(cfg.tcgdex.excludedSeriesIds).toEqual(['tcgp']);
    expect(cfg.tcgdex.setsPath).toBe('/sets');
  });

  it('parses and deduplicates excluded series ID CSV', () => {
    applyBaseEnv({
      TCGDEX_EXCLUDED_SERIES_IDS: ' tcgp , me ,tcgp,ME '
    });

    const cfg = loadPipelineConfig();
    expect(cfg.tcgdex.excludedSeriesIds).toEqual(['tcgp', 'me']);
  });
});
