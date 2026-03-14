export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 50;

export const PRICE_RANGES = ['30d', '90d', '1y'] as const;
export type PriceRange = (typeof PRICE_RANGES)[number];

export const ALERT_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW'] as const;
export const HOLDING_VARIANTS = [
  'raw',
  'holo',
  'reverse_holo',
  'first_edition',
  'other'
] as const;
export const HOLDING_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;

export const DEFAULT_SOURCE = 'tcgdex' as const;
export const DEFAULT_INGEST_SCHEDULE_CRON = 'cron(0 6 * * ? *)';
export const SUPPORTED_CURRENCIES = ['USD'] as const;
