import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  translateTcgdexCardId,
  type TcgdexCardIdentityInput
} from '../apps/pipeline/src/providers/tcgdex-id';
import {
  extractTcgdexSetIdsFromSeriesPayload,
  extractTcgdexSetSummaries,
  extractSetIdFromCardId,
  isExcludedSetId,
  parseCsvList,
  parseTcgdexPagination,
  type TcgdexSetSummary,
  resolveExcludedSetIdsFromPayload
} from '../apps/pipeline/src/providers/tcgdex-scope';

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
  set?: { id?: string; name?: string };
  name?: string;
  rarity?: string | { name?: string };
  image?: string | Record<string, unknown>;
}

interface SeedWriteRequest {
  PutRequest: {
    Item: Record<string, unknown>;
  };
}

const TCGDEX_SETS_PAGE_SIZE = 250;
const TCGDEX_SETS_MAX_PAGES = 100;
const TCGDEX_SET_DETAIL_CONCURRENCY = 10;
const TCGDEX_SERIES_DETAIL_CONCURRENCY = 4;

interface SeedConfig {
  region: string;
  tableName: string;
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
  seedLimit: number;
}

interface SeedMetrics {
  pagesFetched: number;
  totalCardsScanned: number;
  detailFetched: number;
  mapped: number;
  excludedByScope: number;
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
  const excludedSeriesIds = parseCsvList(process.env.TCGDEX_EXCLUDED_SERIES_IDS ?? 'tcgp');
  return {
    region: process.env.AWS_REGION ?? 'us-west-2',
    tableName: required('TABLE_CARDS'),
    baseUrl: process.env.TCGDEX_BASE_URL ?? 'https://api.tcgdex.net/v2/en',
    listPath: process.env.TCGDEX_LIST_PATH ?? '/cards',
    setsPath: process.env.TCGDEX_SETS_PATH ?? '/sets',
    detailPathTemplate: process.env.TCGDEX_DETAIL_PATH_TEMPLATE ?? '/cards/{id}',
    excludedSeriesIds,
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

function buildSetsUrl(config: SeedConfig): URL {
  return buildApiUrl(config.baseUrl, config.setsPath);
}

function buildSetDetailUrl(config: SeedConfig, setId: string): URL {
  const setsPath = config.setsPath.endsWith('/') ? config.setsPath.slice(0, -1) : config.setsPath;
  return buildApiUrl(config.baseUrl, `${setsPath}/${encodeURIComponent(setId)}`);
}

function buildSeriesDetailUrl(config: SeedConfig, seriesId: string): URL {
  return buildApiUrl(config.baseUrl, `/series/${encodeURIComponent(seriesId)}`);
}

function hasSeriesMetadata(setSummary: TcgdexSetSummary): boolean {
  return typeof setSummary.serie?.id === 'string' || typeof setSummary.series?.id === 'string';
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

async function resolveExcludedSetIds(config: SeedConfig, metrics: SeedMetrics): Promise<Set<string>> {
  if (config.excludedSeriesIds.length === 0) {
    return new Set<string>();
  }

  const seriesResolved = await resolveExcludedSetIdsFromSeriesEndpoints(config, metrics);
  const excludedSetIds = new Set<string>(seriesResolved.excludedSetIds);
  let unmatchedSeries = config.excludedSeriesIds.filter(
    (seriesId) => !seriesResolved.matchedSeriesIds.has(seriesId)
  );
  if (unmatchedSeries.length === 0) {
    return excludedSetIds;
  }

  let setSummaries = await fetchAllSets(config, metrics);
  let resolved = resolveExcludedSetIdsFromPayload(setSummaries, unmatchedSeries);
  if (resolved.totalSetsParsed === 0) {
    throw new Error('Failed to resolve excluded TCGdex sets: /sets payload contained no set entries.');
  }

  unmatchedSeries = unmatchedSeries.filter((seriesId) => !resolved.matchedSeriesIds.has(seriesId));
  if (unmatchedSeries.length > 0 && setSummaries.some((summary) => !hasSeriesMetadata(summary))) {
    setSummaries = await hydrateSetSeriesMetadata(config, metrics, setSummaries);
    resolved = resolveExcludedSetIdsFromPayload(setSummaries, unmatchedSeries);
    unmatchedSeries = unmatchedSeries.filter((seriesId) => !resolved.matchedSeriesIds.has(seriesId));
  }

  if (unmatchedSeries.length > 0) {
    throw new Error(
      `Failed to resolve excluded TCGdex sets: no sets found for excluded series ${unmatchedSeries.join(', ')}.`
    );
  }

  for (const setId of resolved.excludedSetIds) {
    excludedSetIds.add(setId);
  }

  return excludedSetIds;
}

async function resolveExcludedSetIdsFromSeriesEndpoints(
  config: SeedConfig,
  metrics: SeedMetrics
): Promise<{ excludedSetIds: Set<string>; matchedSeriesIds: Set<string> }> {
  const excludedSetIds = new Set<string>();
  const matchedSeriesIds = new Set<string>();

  await runWithConcurrency(config.excludedSeriesIds, TCGDEX_SERIES_DETAIL_CONCURRENCY, async (seriesId) => {
    let payload: unknown;
    try {
      payload = await requestJson(buildSeriesDetailUrl(config, seriesId), config, metrics);
    } catch (error) {
      metrics.requestFailures += 1;
      return;
    }

    const setIds = extractTcgdexSetIdsFromSeriesPayload(payload);
    if (setIds.size === 0) {
      return;
    }

    matchedSeriesIds.add(seriesId);
    for (const setId of setIds) {
      excludedSetIds.add(setId);
    }
  });

  return {
    excludedSetIds,
    matchedSeriesIds
  };
}

async function fetchAllSets(config: SeedConfig, metrics: SeedMetrics): Promise<TcgdexSetSummary[]> {
  const setsById = new Map<string, TcgdexSetSummary>();
  let page = 1;
  let pagesFetched = 0;
  let hasNextPage = true;

  while (hasNextPage && pagesFetched < TCGDEX_SETS_MAX_PAGES) {
    const setsUrl = buildSetsUrl(config);
    setsUrl.searchParams.set('pagination:page', String(page));
    setsUrl.searchParams.set('pagination:itemsPerPage', String(TCGDEX_SETS_PAGE_SIZE));

    let payload: unknown;
    try {
      payload = await requestJson(setsUrl, config, metrics);
    } catch (error) {
      metrics.requestFailures += 1;
      throw new Error(
        `Failed to resolve excluded TCGdex sets: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const summaries = extractTcgdexSetSummaries(payload);
    const beforeCount = setsById.size;
    for (const summary of summaries) {
      if (typeof summary.id !== 'string' || summary.id.trim().length === 0) {
        continue;
      }
      setsById.set(summary.id.trim().toLowerCase(), summary);
    }

    const pagination = parseTcgdexPagination(payload, page, summaries.length);
    hasNextPage = pagination.hasNextPage;

    if (setsById.size === beforeCount && !pagination.nextPage) {
      hasNextPage = false;
    }

    const nextPage = pagination.nextPage ?? page + 1;
    if (nextPage <= page) {
      hasNextPage = false;
    } else {
      page = nextPage;
    }

    pagesFetched += 1;
  }

  return [...setsById.values()];
}

async function hydrateSetSeriesMetadata(
  config: SeedConfig,
  metrics: SeedMetrics,
  summaries: TcgdexSetSummary[]
): Promise<TcgdexSetSummary[]> {
  const hydrated = [...summaries];

  await runWithConcurrency(hydrated, TCGDEX_SET_DETAIL_CONCURRENCY, async (summary, index) => {
    if (typeof summary.id !== 'string' || summary.id.trim().length === 0 || hasSeriesMetadata(summary)) {
      return;
    }

    const setId = summary.id;
    let payload: unknown;
    try {
      payload = await requestJson(buildSetDetailUrl(config, setId), config, metrics);
    } catch (error) {
      metrics.requestFailures += 1;
      throw new Error(
        `Failed to resolve excluded TCGdex set detail for ${setId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (typeof payload !== 'object' || payload === null) {
      return;
    }

    const detail = payload as TcgdexSetSummary;
    hydrated[index] = {
      ...summary,
      ...detail,
      id: typeof detail.id === 'string' && detail.id.trim().length > 0 ? detail.id : summary.id
    };
  });

  return hydrated;
}

async function fetchAllCardIds(
  config: SeedConfig,
  excludedSetIds: ReadonlySet<string>,
  metrics: SeedMetrics
): Promise<string[]> {
  const collected = new Set<string>();
  let page = 1;

  while (true) {
    if (config.maxPages > 0 && metrics.pagesFetched >= config.maxPages) {
      break;
    }

    const listPayload = await requestJson(buildListUrl(config, page), config, metrics);
    const parsed = parseListPage(listPayload, config.pageSize, page);

    for (const cardId of parsed.ids) {
      const trimmed = cardId.trim();
      if (trimmed.length === 0) {
        continue;
      }

      metrics.totalCardsScanned += 1;

      const setId = extractSetIdFromCardId(trimmed);
      if (isExcludedSetId(setId, excludedSetIds)) {
        metrics.excludedByScope += 1;
        metrics.skipped += 1;
        incrementCounter(metrics.skipReasonCounts, 'excluded out-of-scope set');
        continue;
      }

      collected.add(trimmed);
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
  const normalizeTcgdexAssetUrl = (value: string): string => {
    try {
      const parsed = new URL(value);
      if (parsed.hostname.toLowerCase() !== 'assets.tcgdex.net') {
        return value;
      }

      const trimmedPath = parsed.pathname.replace(/\/+$/g, '');
      if (/\.(png|jpe?g|webp|avif|gif)$/i.test(trimmedPath)) {
        return value;
      }

      parsed.pathname = `${trimmedPath}/high.webp`;
      return parsed.toString();
    } catch {
      return value;
    }
  };

  if (typeof image === 'string' && image.length > 0) {
    return normalizeTcgdexAssetUrl(image);
  }

  if (typeof image !== 'object' || image === null) {
    return undefined;
  }

  const imageObject = image as Record<string, unknown>;
  const candidates = [imageObject.large, imageObject.high, imageObject.url, imageObject.small];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return normalizeTcgdexAssetUrl(candidate);
    }
  }
  return undefined;
}

function normalizeSeedRarity(
  rarityValue: string | undefined,
  setName: string
): string | undefined {
  if (typeof rarityValue !== 'string') {
    return undefined;
  }

  const trimmedRarity = rarityValue.trim();
  if (!trimmedRarity) {
    return undefined;
  }

  if (trimmedRarity.toLowerCase() !== 'none') {
    return trimmedRarity;
  }

  if (setName.toLowerCase().includes('promo')) {
    return 'Promo';
  }

  return undefined;
}

function mapDetailToSeedCard(
  detail: TcgdexCardDetail,
  excludedSetIds: ReadonlySet<string>
): { card?: SeedCard; skipReason?: string } {
  const cardId = translateTcgdexCardId(detail);
  if (!cardId) {
    return { skipReason: 'unknown card ID' };
  }

  const name = typeof detail.name === 'string' ? detail.name.trim() : '';
  if (!name) {
    return { skipReason: 'missing card name' };
  }

  const splitIndex = cardId.lastIndexOf('-');
  const setIdFallback = splitIndex > 0 ? cardId.slice(0, splitIndex) : undefined;
  const numberFallback = splitIndex > 0 ? cardId.slice(splitIndex + 1) : undefined;

  const setId = typeof detail.set?.id === 'string' && detail.set.id.length > 0
    ? detail.set.id
    : setIdFallback;
  if (!setId) {
    return { skipReason: 'missing set ID' };
  }
  if (isExcludedSetId(setId, excludedSetIds)) {
    return { skipReason: 'excluded out-of-scope set' };
  }

  const number = typeof detail.localId === 'string' && detail.localId.length > 0
    ? detail.localId
    : numberFallback;
  if (!number) {
    return { skipReason: 'missing card number' };
  }

  const setName =
    typeof detail.set?.name === 'string' && detail.set.name.length > 0
      ? detail.set.name
      : setId;

  let rawRarity: string | undefined;
  if (typeof detail.rarity === 'string' && detail.rarity.length > 0) {
    rawRarity = detail.rarity;
  } else if (typeof detail.rarity === 'object' && detail.rarity !== null) {
    const rarityName = (detail.rarity as { name?: unknown }).name;
    if (typeof rarityName === 'string' && rarityName.length > 0) {
      rawRarity = rarityName;
    }
  }
  const rarity = normalizeSeedRarity(rawRarity, setName);

  return {
    card: {
      cardId,
      name,
      setId,
      setName,
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

function buildPutRequest(card: SeedCard, nowIso: string): SeedWriteRequest {
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
      const remaining = (response.UnprocessedItems?.[tableName] ?? []) as SeedWriteRequest[];
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
    excludedByScope: 0,
    skipped: 0,
    skipReasonCounts: {},
    requestFailures: 0,
    retryCount: 0,
    writeBatches: 0
  };

  const startedAt = Date.now();
  const excludedSetIds = await resolveExcludedSetIds(config, metrics);
  console.log(
    `Resolved ${excludedSetIds.size} excluded set IDs from series: ${config.excludedSeriesIds.join(', ')}`
  );

  console.log('Fetching TCGdex card IDs...');
  const sourceIds = await fetchAllCardIds(config, excludedSetIds, metrics);
  console.log(
    `Collected ${sourceIds.length} IDs from TCGdex list pages after excluding ${metrics.excludedByScope} out-of-scope cards.`
  );

  const cardsById = new Map<string, SeedCard>();

  await runWithConcurrency(sourceIds, config.detailConcurrency, async (sourceId) => {
    try {
      const detailPayload = await requestJson(buildDetailUrl(config, sourceId), config, metrics);
      metrics.detailFetched += 1;

      const mapped = mapDetailToSeedCard(detailPayload as TcgdexCardDetail, excludedSetIds);
      if (!mapped.card) {
        metrics.skipped += 1;
        if (mapped.skipReason === 'excluded out-of-scope set') {
          metrics.excludedByScope += 1;
        }
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
