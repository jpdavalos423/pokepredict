import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const QUERY_SAMPLES = ['pi', 'ch', 'ar', 'ex'] as const;
const SET_SAMPLES = ['sv3', 'sv2', 'base1', 'swsh12', 'pop3'] as const;
const LIMIT_PER_CALL = 50;
const PROBE_LIMIT = 100;
const RANGE = '30d';
const ISO_UTC_MILLIS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface ApiErrorShape {
  code: string;
  message: string;
  requestId: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: ApiErrorShape | null;
}

interface CardListItem {
  cardId: string;
}

interface CardsListData {
  items: CardListItem[];
}

interface LatestPriceData {
  cardId: string;
  asOf: string;
  marketCents: number;
  marketPrice: number;
}

interface PriceHistoryPoint {
  ts: string;
  marketCents: number;
  marketPrice: number;
}

interface PriceHistoryData {
  cardId: string;
  from: string;
  to: string;
  points: PriceHistoryPoint[];
}

interface HttpResult<T> {
  path: string;
  status: number;
  body: ApiEnvelope<T>;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readIngestionArn(): string {
  if (process.env.INGESTION_ARN) {
    return process.env.INGESTION_ARN;
  }

  const envPath = process.env.PHASE1_ENV_FILE ?? '.phase1.env';
  if (!existsSync(envPath)) {
    throw new Error(
      `Missing INGESTION_ARN and ${envPath} file not found. Set INGESTION_ARN or PHASE1_ENV_FILE.`
    );
  }

  const content = readFileSync(envPath, 'utf8');
  const line = content
    .split('\n')
    .map((rawLine) => rawLine.trim())
    .find((rawLine) => rawLine.startsWith('INGESTION_ARN='));

  if (!line) {
    throw new Error(`INGESTION_ARN not found in ${envPath}.`);
  }

  const value = line.slice('INGESTION_ARN='.length).trim();
  if (!value) {
    throw new Error(`INGESTION_ARN is empty in ${envPath}.`);
  }

  return value;
}

function awsStepFunctions(args: string[]): string {
  try {
    return execFileSync('aws', ['stepfunctions', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AWS CLI call failed: aws stepfunctions ${args.join(' ')}\n${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runIdNow(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `manual-tcgdex-${stamp}-${rand}`;
}

async function triggerAndWaitForIngestion(ingestionArn: string): Promise<void> {
  const runId = runIdNow();
  const input = JSON.stringify({
    source: 'tcgdex',
    mode: 'manual',
    runId
  });

  const executionArn = awsStepFunctions([
    'start-execution',
    '--state-machine-arn',
    ingestionArn,
    '--input',
    input,
    '--query',
    'executionArn',
    '--output',
    'text'
  ]);

  console.log(`Started ingestion execution: ${executionArn}`);

  const maxPolls = 180;
  for (let i = 0; i < maxPolls; i += 1) {
    const status = awsStepFunctions([
      'describe-execution',
      '--execution-arn',
      executionArn,
      '--query',
      'status',
      '--output',
      'text'
    ]);

    if (status === 'SUCCEEDED') {
      console.log('Ingestion execution succeeded.');
      return;
    }

    if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
      const details = awsStepFunctions([
        'describe-execution',
        '--execution-arn',
        executionArn,
        '--query',
        '{status:status,error:error,cause:cause}',
        '--output',
        'json'
      ]);
      throw new Error(`Ingestion execution ended with ${status}: ${details}`);
    }

    await sleep(5000);
  }

  throw new Error('Timed out waiting for ingestion execution to complete.');
}

async function httpGet<T>(baseUrl: string, path: string): Promise<HttpResult<T>> {
  const response = await fetch(`${baseUrl}${path}`);
  let body: ApiEnvelope<T>;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(`Non-JSON response from ${path} (status ${response.status}).`);
  }

  return {
    path,
    status: response.status,
    body
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertMarketPriceMatchesCents(marketCents: number, marketPrice: number, context: string): void {
  assert(
    Math.abs(marketPrice - marketCents / 100) < 1e-9,
    `${context}: marketPrice (${marketPrice}) must equal marketCents / 100 (${marketCents / 100}).`
  );
}

function parseIsoTimestamp(value: string, context: string): number {
  assert(ISO_UTC_MILLIS_REGEX.test(value), `${context}: expected strict ISO UTC timestamp with milliseconds.`);
  const parsed = Date.parse(value);
  assert(Number.isFinite(parsed), `${context}: invalid ISO timestamp '${value}'.`);
  assert(new Date(parsed).toISOString() === value, `${context}: timestamp must round-trip exactly as ISO UTC.`);
  return parsed;
}

async function collectCandidateIds(baseUrl: string): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();

  const addCards = (items: CardListItem[], source: string): void => {
    for (const item of items) {
      assert(typeof item.cardId === 'string' && item.cardId.length > 0, `${source}: invalid cardId.`);
      if (seen.has(item.cardId)) {
        continue;
      }
      seen.add(item.cardId);
      ids.push(item.cardId);
    }
  };

  for (const query of QUERY_SAMPLES) {
    const result = await httpGet<CardsListData>(
      baseUrl,
      `/cards?query=${encodeURIComponent(query)}&limit=${LIMIT_PER_CALL}`
    );
    assert(result.status === 200 && result.body.ok && result.body.data !== null, `Failed to list cards for query='${query}'.`);
    addCards(result.body.data.items, `query '${query}'`);
  }

  for (const set of SET_SAMPLES) {
    const result = await httpGet<CardsListData>(
      baseUrl,
      `/cards?set=${encodeURIComponent(set)}&limit=${LIMIT_PER_CALL}`
    );
    assert(result.status === 200 && result.body.ok && result.body.data !== null, `Failed to list cards for set='${set}'.`);
    addCards(result.body.data.items, `set '${set}'`);
  }

  return ids.slice(0, PROBE_LIMIT);
}

async function run(): Promise<void> {
  const baseUrl = required('API_PROXY_TARGET').replace(/\/$/, '');
  const skipIngestion = process.env.SKIP_INGESTION === '1';

  if (!skipIngestion) {
    const ingestionArn = readIngestionArn();
    await triggerAndWaitForIngestion(ingestionArn);
  } else {
    console.log('Skipping ingestion trigger because SKIP_INGESTION=1');
  }

  const candidateIds = await collectCandidateIds(baseUrl);
  assert(candidateIds.length > 0, 'No candidate card IDs collected from /cards queries/sets.');

  let pricedCount = 0;
  let unpricedCount = 0;

  for (const cardId of candidateIds) {
    const encodedId = encodeURIComponent(cardId);

    const card = await httpGet<Record<string, unknown>>(baseUrl, `/cards/${encodedId}`);
    assert(card.status === 200 && card.body.ok, `/cards/${cardId} did not return 200 OK.`);

    const latest = await httpGet<LatestPriceData>(baseUrl, `/cards/${encodedId}/price/latest`);
    const prices = await httpGet<PriceHistoryData>(baseUrl, `/cards/${encodedId}/prices?range=${RANGE}`);

    assert(prices.status === 200 && prices.body.ok && prices.body.data !== null, `/cards/${cardId}/prices did not return 200 OK.`);
    assert(Array.isArray(prices.body.data.points), `/cards/${cardId}/prices points must be an array.`);

    const fromTs = parseIsoTimestamp(prices.body.data.from, `/cards/${cardId}/prices from`);
    const toTs = parseIsoTimestamp(prices.body.data.to, `/cards/${cardId}/prices to`);
    assert(fromTs <= toTs, `/cards/${cardId}/prices from must be <= to.`);

    let previousTs = -Infinity;
    for (const point of prices.body.data.points) {
      assert(
        isFiniteNumber(point.marketCents) && Number.isInteger(point.marketCents) && point.marketCents >= 0,
        `/cards/${cardId}/prices point marketCents must be a non-negative integer.`
      );
      assert(isFiniteNumber(point.marketPrice) && point.marketPrice >= 0, `/cards/${cardId}/prices point marketPrice must be a non-negative number.`);
      assertMarketPriceMatchesCents(point.marketCents, point.marketPrice, `/cards/${cardId}/prices point`);

      const ts = parseIsoTimestamp(point.ts, `/cards/${cardId}/prices point ts`);
      assert(ts >= previousTs, `/cards/${cardId}/prices points must be ascending by ts.`);
      assert(ts >= fromTs && ts <= toTs, `/cards/${cardId}/prices point ts must be within [from,to].`);
      previousTs = ts;
    }

    if (latest.status === 200) {
      assert(latest.body.ok && latest.body.data !== null, `/cards/${cardId}/price/latest returned 200 with invalid envelope.`);

      const data = latest.body.data;
      assert(
        isFiniteNumber(data.marketCents) && Number.isInteger(data.marketCents) && data.marketCents >= 0,
        `/cards/${cardId}/price/latest marketCents must be a non-negative integer.`
      );
      assert(isFiniteNumber(data.marketPrice) && data.marketPrice >= 0, `/cards/${cardId}/price/latest marketPrice must be a non-negative number.`);
      assertMarketPriceMatchesCents(data.marketCents, data.marketPrice, `/cards/${cardId}/price/latest`);
      parseIsoTimestamp(data.asOf, `/cards/${cardId}/price/latest asOf`);
      pricedCount += 1;
      continue;
    }

    if (latest.status === 404) {
      const errorCode = latest.body.error?.code;
      assert(errorCode === 'PRICE_NOT_FOUND', `/cards/${cardId}/price/latest 404 must return PRICE_NOT_FOUND.`);
      unpricedCount += 1;
      continue;
    }

    throw new Error(`/cards/${cardId}/price/latest returned unexpected status ${latest.status}.`);
  }

  if (pricedCount === 0) {
    throw new Error('No priced cards found after successful ingestion; likely stale/insufficient ingestion coverage.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        probedCards: candidateIds.length,
        pricedCount,
        unpricedCount,
        message:
          unpricedCount > 0
            ? 'Verification passed with both priced and unpriced cards in sampled probe window.'
            : 'Verification passed; sampled probe window did not include unpriced cards.'
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
