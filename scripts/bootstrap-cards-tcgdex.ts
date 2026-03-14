import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, type WriteRequest } from '@aws-sdk/lib-dynamodb';
import {
  translateTcgdexCardId,
  type TcgdexCardIdentityInput
} from '../apps/pipeline/src/providers/tcgdex-id';

interface SeedCard {
  cardId: string;
  name: string;
  setId: string;
  setName: string;
  number: string;
  rarity?: string;
  imageUrl?: string;
}

interface TcgdexCardDetail extends TcgdexCardIdentityInput {
  name?: string;
  rarity?: string | { name?: string };
  image?: string | Record<string, unknown>;
}

interface SeedConfig {
  region: string;
  tableName: string;
  baseUrl: string;
  listPath: string;
  detailPathTemplate: string;
  pageSize: number;
  maxPages: number;
  detailConcurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  requestTimeoutMs: number;
  seedLimit: number;
}

interface SeedMetrics {
  pagesFetched: number;
  totalCardsScanned: number;
  detailFetched: number;
  mapped: number;
  skipped: number;
  skipReasonCounts: Record<string, number>;
  requestFailures: number;
  retryCount: number;
  writeBatches: number;
}

class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
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

function atLeast(value: number, minimum: number): number {
  return value < minimum ? minimum : value;
}

function buildConfig(): SeedConfig {
  return {
    region: process.env.AWS_REGION ?? 'us-west-2',
    tableName: required('TABLE_CARDS'),
    baseUrl: process.env.TCGDEX_BASE_URL ?? 'https://api.tcgdex.net/v2/en',
    listPath: process.env.TCGDEX_LIST_PATH ?? '/cards',
    detailPathTemplate: process.env.TCGDEX_DETAIL_PATH_TEMPLATE ?? '/cards/{id}',
    pageSize: atLeast(readIntOrDefault('TCGDEX_PAGE_SIZE', 100), 1),
    maxPages: atLeast(readIntOrDefault('TCGDEX_MAX_PAGES', 0), 0),
    detailConcurrency: atLeast(readIntOrDefault('TCGDEX_DETAIL_CONCURRENCY', 10), 1),
    maxRetries: atLeast(readIntOrDefault('TCGDEX_MAX_RETRIES', 2), 0),
    retryBaseDelayMs: atLeast(readIntOrDefault('TCGDEX_RETRY_BASE_DELAY_MS', 250), 1),
    requestTimeoutMs: atLeast(readIntOrDefault('TCGDEX_REQUEST_TIMEOUT_MS', 10000), 1),
    seedLimit: atLeast(readIntOrDefault('TCGDEX_SEED_LIMIT', 0), 0)
  };
}

function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function incrementCounter(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function buildApiUrl(baseUrl: string, path: string): URL {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractIds(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string') {
          return (entry as { id: string }).id;
        }
        return undefined;
      })
      .filter((value): value is string => Boolean(value));
  }

  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  const list = objectPayload.cards ?? objectPayload.items ?? objectPayload.data ?? objectPayload.results;
  if (!Array.isArray(list)) {
    return [];
  }

  return extractIds(list);
}

function parseListPage(payload: unknown, pageSize: number, currentPage: number): { ids: string[]; nextPage?: number; hasNextPage: boolean } {
  const ids = extractIds(payload);
  let hasNextPage = ids.length >= pageSize;
  let nextPage: number | undefined;

  if (typeof payload === 'object' && payload !== null) {
    const objectPayload = payload as Record<string, unknown>;
    const pagination = objectPayload.pagination;

    if (typeof pagination === 'object' && pagination !== null) {
      const page = typeof (pagination as { page?: unknown }).page === 'number'
        ? (pagination as { page: number }).page
        : currentPage;
      const totalPagesValue =
        (pagination as { pageCount?: unknown }).pageCount ??
        (pagination as { totalPages?: unknown }).totalPages;
      const totalPages = typeof totalPagesValue === 'number' ? totalPagesValue : undefined;
      const explicitHasNext = (pagination as { hasNextPage?: unknown }).hasNextPage;

      if (typeof explicitHasNext === 'boolean') {
        hasNextPage = explicitHasNext;
      } else if (typeof totalPages === 'number') {
        hasNextPage = page < totalPages;
      }

      if (hasNextPage) {
        nextPage = page + 1;
      }
    }
  }

  return { ids, nextPage, hasNextPage };
}

function buildListUrl(config: SeedConfig, page: number): URL {
  const url = buildApiUrl(config.baseUrl, config.listPath);
  url.searchParams.set('pagination:page', String(page));
  url.searchParams.set('pagination:itemsPerPage', String(config.pageSize));
  return url;
}

function buildDetailUrl(config: SeedConfig, sourceCardId: string): URL {
  const path = config.detailPathTemplate.replace('{id}', encodeURIComponent(sourceCardId));
  return buildApiUrl(config.baseUrl, path);
}

function isRetriableStatus(status: number): boolean {
  if (status === 408 || status === 429) {
    return true;
  }
  return status >= 500 && status <= 599;
}

function isRetriableError(error: unknown): boolean {
  if (error instanceof HttpStatusError) {
    return isRetriableStatus(error.status);
  }
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  return error instanceof TypeError;
}

async function requestJson(url: URL, config: SeedConfig, metrics: SeedMetrics): Promise<unknown> {
  const maxAttempts = config.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal
      });

      if (!response.ok) {
        throw new HttpStatusError(response.status, `HTTP ${response.status} for ${url.toString()}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt >= maxAttempts || !isRetriableError(error)) {
        throw error;
      }

      metrics.retryCount += 1;
      const exponential = config.retryBaseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * config.retryBaseDelayMs);
      await sleep(exponential + jitter);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Request exhausted retries for ${url.toString()}`);
}

async function fetchAllCardIds(config: SeedConfig, metrics: SeedMetrics): Promise<string[]> {
  const collected = new Set<string>();
  let page = 1;

  while (true) {
    if (config.maxPages > 0 && metrics.pagesFetched >= config.maxPages) {
      break;
    }

    const listPayload = await requestJson(buildListUrl(config, page), config, metrics);
    const parsed = parseListPage(listPayload, config.pageSize, page);

    for (const cardId of parsed.ids) {
      if (cardId.trim().length > 0) {
        collected.add(cardId.trim());
      }
      if (config.seedLimit > 0 && collected.size >= config.seedLimit) {
        return [...collected];
      }
    }

    metrics.pagesFetched += 1;
    if (!parsed.hasNextPage) {
      break;
    }
    page = parsed.nextPage ?? page + 1;
  }

  return [...collected];
}

function extractImageUrl(image: unknown): string | undefined {
  if (typeof image === 'string' && image.length > 0) {
    return image;
  }

  if (typeof image !== 'object' || image === null) {
    return undefined;
  }

  const imageObject = image as Record<string, unknown>;
  const candidates = [imageObject.large, imageObject.high, imageObject.url, imageObject.small];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function mapDetailToSeedCard(detail: TcgdexCardDetail): { card?: SeedCard; skipReason?: string } {
  const cardId = translateTcgdexCardId(detail);
  if (!cardId) {
    return { skipReason: 'unknown card ID' };
  }

  const name = typeof detail.name === 'string' ? detail.name.trim() : '';
  if (!name) {
    return { skipReason: 'missing card name' };
  }

  const splitIndex = cardId.indexOf('-');
  const setIdFallback = splitIndex > 0 ? cardId.slice(0, splitIndex) : undefined;
  const numberFallback = splitIndex > 0 ? cardId.slice(splitIndex + 1) : undefined;

  const setId = typeof detail.set?.id === 'string' && detail.set.id.length > 0
    ? detail.set.id
    : setIdFallback;
  if (!setId) {
    return { skipReason: 'missing set ID' };
  }

  const number = typeof detail.localId === 'string' && detail.localId.length > 0
    ? detail.localId
    : numberFallback;
  if (!number) {
    return { skipReason: 'missing card number' };
  }

  let rarity: string | undefined;
  if (typeof detail.rarity === 'string' && detail.rarity.length > 0) {
    rarity = detail.rarity;
  } else if (typeof detail.rarity === 'object' && detail.rarity !== null) {
    const rarityName = (detail.rarity as { name?: unknown }).name;
    if (typeof rarityName === 'string' && rarityName.length > 0) {
      rarity = rarityName;
    }
  }

  return {
    card: {
      cardId,
      name,
      setId,
      setName:
        typeof detail.set?.name === 'string' && detail.set.name.length > 0
          ? detail.set.name
          : setId,
      number,
      rarity,
      imageUrl: extractImageUrl(detail.image)
    }
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const workerCount = Math.min(concurrency, items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        await worker(items[index] as T, index);
      }
    })
  );
}

function buildPutRequest(card: SeedCard, nowIso: string): WriteRequest {
  const normalizedName = normalizeName(card.name);
  const firstLetter = normalizedName.charAt(0) || '#';

  return {
    PutRequest: {
      Item: {
        pk: `CARD#${card.cardId}`,
        sk: 'META',
        cardId: card.cardId,
        name: card.name,
        normalizedName,
        setId: card.setId,
        setName: card.setName,
        number: card.number,
        rarity: card.rarity,
        imageUrl: card.imageUrl,
        gsi1pk: `SET#${card.setId}`,
        gsi1sk: `NAME#${normalizedName}#NUM#${card.number}`,
        gsi2pk: `NAME#${firstLetter}`,
        gsi2sk: `NAME#${normalizedName}#SET#${card.setId}#NUM#${card.number}`,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1
      }
    }
  };
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function writeCards(
  ddb: DynamoDBDocumentClient,
  tableName: string,
  cards: SeedCard[],
  metrics: SeedMetrics
): Promise<void> {
  if (cards.length === 0) {
    return;
  }

  const nowIso = new Date().toISOString();
  const requests = cards.map((card) => buildPutRequest(card, nowIso));
  const chunks = chunkItems(requests, 25);

  for (const chunk of chunks) {
    let unprocessed = chunk;
    let attempts = 0;

    while (unprocessed.length > 0) {
      const response = await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: unprocessed
          }
        })
      );

      metrics.writeBatches += 1;
      const remaining = response.UnprocessedItems?.[tableName] ?? [];
      if (remaining.length === 0) {
        break;
      }

      attempts += 1;
      const backoffMs = Math.min(5000, 100 * 2 ** attempts);
      await sleep(backoffMs);
      unprocessed = remaining;
    }
  }
}

async function run(): Promise<void> {
  const config = buildConfig();
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));

  const metrics: SeedMetrics = {
    pagesFetched: 0,
    totalCardsScanned: 0,
    detailFetched: 0,
    mapped: 0,
    skipped: 0,
    skipReasonCounts: {},
    requestFailures: 0,
    retryCount: 0,
    writeBatches: 0
  };

  const startedAt = Date.now();
  console.log('Fetching TCGdex card IDs...');
  const sourceIds = await fetchAllCardIds(config, metrics);
  metrics.totalCardsScanned = sourceIds.length;
  console.log(`Fetched ${sourceIds.length} IDs from TCGdex list pages.`);

  const cardsById = new Map<string, SeedCard>();

  await runWithConcurrency(sourceIds, config.detailConcurrency, async (sourceId) => {
    try {
      const detailPayload = await requestJson(buildDetailUrl(config, sourceId), config, metrics);
      metrics.detailFetched += 1;

      const mapped = mapDetailToSeedCard(detailPayload as TcgdexCardDetail);
      if (!mapped.card) {
        metrics.skipped += 1;
        incrementCounter(metrics.skipReasonCounts, mapped.skipReason ?? 'unknown mapping error');
        return;
      }

      cardsById.set(mapped.card.cardId, mapped.card);
      metrics.mapped += 1;
    } catch (error) {
      metrics.requestFailures += 1;
      metrics.skipped += 1;
      incrementCounter(metrics.skipReasonCounts, 'detail request failure');
      console.warn(
        JSON.stringify({
          level: 'warn',
          script: 'bootstrap-cards-tcgdex',
          sourceId,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    }
  });

  const cards = [...cardsById.values()];
  await writeCards(ddb, config.tableName, cards, metrics);

  const durationMs = Date.now() - startedAt;
  console.log(
    JSON.stringify({
      level: 'info',
      script: 'bootstrap-cards-tcgdex',
      tableName: config.tableName,
      region: config.region,
      insertedOrUpdatedCount: cards.length,
      metrics: {
        ...metrics,
        durationMs
      }
    })
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
