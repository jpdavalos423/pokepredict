export interface PipelineConfig {
  awsRegion: string;
  rawBucket: string;
  sourceName: string;
  scheduleCron: string;
  sesFromEmail: string;
  tcgdex: {
    baseUrl: string;
    listPath: string;
    setsPath: string;
    detailPathTemplate: string;
    excludedSeriesIds: string[];
    pageSize: number;
    maxPages: number;
    detailConcurrency: number;
    maxRetries: number;
    retryBaseDelayMs: number;
    requestTimeoutMs: number;
    failureRateThreshold: number;
  };
  tables: {
    cards: string;
    prices: string;
    latestPrices: string;
    signals: string;
    alertsByUser: string;
    alertsByCard: string;
  };
}

function readCsvOrDefault(name: string, fallback: string): string[] {
  const rawValue = process.env[name] ?? fallback;
  return rawValue
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token, index, array) => token.length > 0 && array.indexOf(token) === index);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readOrDefault(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function readIntOrDefault(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer env var: ${name}`);
  }

  return parsed;
}

function readNumberOrDefault(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number env var: ${name}`);
  }

  return parsed;
}

function atLeast(value: number, minimum: number): number {
  return value < minimum ? minimum : value;
}

export function loadPipelineConfig(): PipelineConfig {
  return {
    awsRegion: readOrDefault('AWS_REGION', 'us-west-2'),
    rawBucket: required('RAW_BUCKET'),
    sourceName: required('SOURCE_NAME'),
    scheduleCron: readOrDefault('INGEST_SCHEDULE_CRON', 'cron(0 6 * * ? *)'),
    sesFromEmail: required('SES_FROM_EMAIL'),
    tcgdex: {
      baseUrl: readOrDefault('TCGDEX_BASE_URL', 'https://api.tcgdex.net/v2/en'),
      listPath: readOrDefault('TCGDEX_LIST_PATH', '/cards'),
      setsPath: readOrDefault('TCGDEX_SETS_PATH', '/sets'),
      detailPathTemplate: readOrDefault('TCGDEX_DETAIL_PATH_TEMPLATE', '/cards/{id}'),
      excludedSeriesIds: readCsvOrDefault('TCGDEX_EXCLUDED_SERIES_IDS', 'tcgp'),
      pageSize: atLeast(readIntOrDefault('TCGDEX_PAGE_SIZE', 100), 1),
      maxPages: atLeast(readIntOrDefault('TCGDEX_MAX_PAGES', 0), 0),
      detailConcurrency: atLeast(readIntOrDefault('TCGDEX_DETAIL_CONCURRENCY', 8), 1),
      maxRetries: atLeast(readIntOrDefault('TCGDEX_MAX_RETRIES', 2), 0),
      retryBaseDelayMs: atLeast(readIntOrDefault('TCGDEX_RETRY_BASE_DELAY_MS', 250), 1),
      requestTimeoutMs: atLeast(readIntOrDefault('TCGDEX_REQUEST_TIMEOUT_MS', 10000), 1),
      failureRateThreshold: readNumberOrDefault('TCGDEX_FAILURE_RATE_THRESHOLD', 0.25)
    },
    tables: {
      cards: required('TABLE_CARDS'),
      prices: required('TABLE_PRICES'),
      latestPrices: required('TABLE_LATEST_PRICES'),
      signals: required('TABLE_SIGNALS'),
      alertsByUser: required('TABLE_ALERTS_BY_USER'),
      alertsByCard: required('TABLE_ALERTS_BY_CARD')
    }
  };
}
