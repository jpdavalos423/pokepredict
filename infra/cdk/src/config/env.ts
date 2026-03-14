export interface CdkEnvConfig {
  account: string;
  region: string;
  project: string;
  stage: string;
  sourceName: string;
  ingestScheduleCron: string;
  cursorSigningSecretParam: string;
  sesFromEmail: string;
  fetchRawTimeoutSeconds: number;
  normalizeTimeoutSeconds: number;
  stateMachineTimeoutMinutes: number;
  tcgdex: {
    baseUrl: string;
    listPath: string;
    detailPathTemplate: string;
    pageSize: number;
    maxPages: number;
    detailConcurrency: number;
    maxRetries: number;
    retryBaseDelayMs: number;
    requestTimeoutMs: number;
    failureRateThreshold: string;
  };
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

export function loadCdkEnvConfig(): CdkEnvConfig {
  const stage = readOrDefault('STAGE', 'dev');
  return {
    account: readOrDefault('CDK_DEFAULT_ACCOUNT', '000000000000'),
    region: readOrDefault('CDK_DEFAULT_REGION', 'us-west-2'),
    project: readOrDefault('PROJECT_NAME', 'pokepredict'),
    stage: readOrDefault('STAGE', 'dev'),
    sourceName: readOrDefault('SOURCE_NAME', 'tcgdex'),
    ingestScheduleCron: readOrDefault('INGEST_SCHEDULE_CRON', 'cron(0 6 * * ? *)'),
    cursorSigningSecretParam: readOrDefault(
      'CURSOR_SIGNING_SECRET_PARAM',
      `/pokepredict/${stage}/cursor-signing-secret`
    ),
    sesFromEmail: readOrDefault('SES_FROM_EMAIL', `alerts+${stage}@pokepredict.dev`),
    fetchRawTimeoutSeconds: readIntOrDefault('FETCH_RAW_TIMEOUT_SECONDS', 300),
    normalizeTimeoutSeconds: readIntOrDefault('NORMALIZE_TIMEOUT_SECONDS', 300),
    stateMachineTimeoutMinutes: readIntOrDefault('STATE_MACHINE_TIMEOUT_MINUTES', 30),
    tcgdex: {
      baseUrl: readOrDefault('TCGDEX_BASE_URL', 'https://api.tcgdex.net/v2/en'),
      listPath: readOrDefault('TCGDEX_LIST_PATH', '/cards'),
      detailPathTemplate: readOrDefault('TCGDEX_DETAIL_PATH_TEMPLATE', '/cards/{id}'),
      pageSize: readIntOrDefault('TCGDEX_PAGE_SIZE', 100),
      maxPages: readIntOrDefault('TCGDEX_MAX_PAGES', 0),
      detailConcurrency: readIntOrDefault('TCGDEX_DETAIL_CONCURRENCY', 8),
      maxRetries: readIntOrDefault('TCGDEX_MAX_RETRIES', 2),
      retryBaseDelayMs: readIntOrDefault('TCGDEX_RETRY_BASE_DELAY_MS', 250),
      requestTimeoutMs: readIntOrDefault('TCGDEX_REQUEST_TIMEOUT_MS', 10000),
      failureRateThreshold: readOrDefault('TCGDEX_FAILURE_RATE_THRESHOLD', '0.25')
    }
  };
}
