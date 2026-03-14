const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const COMPACT_USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
});

export function formatUsdFromCents(valueInCents: number): string {
  return USD_FORMATTER.format(valueInCents / 100);
}

export function formatCompactUsdFromCents(valueInCents: number): string {
  return COMPACT_USD_FORMATTER.format(valueInCents / 100);
}

export function formatPercentFromBps(valueInBps: number): string {
  return `${(valueInBps / 100).toFixed(2)}%`;
}

export function formatIsoDate(iso: string): string {
  return DATE_FORMATTER.format(new Date(iso));
}

export function formatIsoDateTime(iso: string): string {
  return DATE_TIME_FORMATTER.format(new Date(iso));
}
