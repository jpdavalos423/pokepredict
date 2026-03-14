import type { RawPriceRecord, StartRunResult } from '@pokepredict/shared';
import { logWarn } from '../handlers/common';
import type {
  PriceSourceFetchMetrics,
  PriceSourceFetchResult,
  PriceSourceProvider
} from './types';
import {
  type TcgdexCardIdentityInput,
  translateTcgdexCardId
} from './tcgdex-id';

export const TCGDEX_SKIP_REASONS = [
  'missing pricing',
  'missing tcgplayer provider',
  'missing normal variant',
  'missing marketPrice',
  'invalid timestamp',
  'unknown card ID'
] as const;

export type TcgdexSkipReason = (typeof TCGDEX_SKIP_REASONS)[number];

interface TcgdexCardDetail extends TcgdexCardIdentityInput {
  pricing?: {
    tcgplayer?: {
      updated?: string;
      normal?: {
        marketPrice?: number;
        lowPrice?: number;
        highPrice?: number;
      };
    };
  };
}

export interface TcgdexMapResult {
  record?: RawPriceRecord;
  skipReason?: TcgdexSkipReason;
  usedFallbackTimestamp: boolean;
}

export interface TcgdexProviderOptions {
  baseUrl: string;
  listPath: string;
  detailPathTemplate: string;
  pageSize: number;
  maxPages: number;
  detailConcurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  requestTimeoutMs: number;
  failureRateThreshold: number;
}

interface TcgdexProviderDependencies {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  nowMs: () => number;
}

interface ListPageResult {
  ids: string[];
  hasNextPage: boolean;
  nextPage?: number;
}

class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return value;
}

function incrementCounter(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

export { normalizeTcgdexCardId, translateTcgdexCardId } from './tcgdex-id';

export function mapTcgdexCardToRawRecord(card: TcgdexCardDetail, asOf: string): TcgdexMapResult {
  const pricing = card.pricing;
  if (!pricing) {
    return {
      skipReason: 'missing pricing',
      usedFallbackTimestamp: false
    };
  }

  const tcgplayer = pricing.tcgplayer;
  if (!tcgplayer) {
    return {
      skipReason: 'missing tcgplayer provider',
      usedFallbackTimestamp: false
    };
  }

  const normal = tcgplayer.normal;
  if (!normal) {
    return {
      skipReason: 'missing normal variant',
      usedFallbackTimestamp: false
    };
  }

  const marketPrice = toNumber(normal.marketPrice);
  if (marketPrice === undefined) {
    return {
      skipReason: 'missing marketPrice',
      usedFallbackTimestamp: false
    };
  }

  const sourceCardId = translateTcgdexCardId(card);
  if (!sourceCardId) {
    return {
      skipReason: 'unknown card ID',
      usedFallbackTimestamp: false
    };
  }

  let recordedAt = asOf;
  let usedFallbackTimestamp = false;

  if (typeof tcgplayer.updated === 'string' && tcgplayer.updated.trim().length > 0) {
    const parsedTimestamp = new Date(tcgplayer.updated);
    if (!Number.isNaN(parsedTimestamp.getTime())) {
      recordedAt = parsedTimestamp.toISOString();
    } else {
      usedFallbackTimestamp = true;
    }
  }

  const record: RawPriceRecord = {
    sourceCardId,
    recordedAt,
    marketPrice,
    currency: 'USD'
  };

  const lowPrice = toNumber(normal.lowPrice);
  if (lowPrice !== undefined) {
    record.lowPrice = lowPrice;
  }

  const highPrice = toNumber(normal.highPrice);
  if (highPrice !== undefined) {
    record.highPrice = highPrice;
  }

  return {
    record,
    usedFallbackTimestamp
  };
}

function extractIdsFromPayload(payload: unknown): Array<string | { id?: string }> {
  if (Array.isArray(payload)) {
    return payload as Array<string | { id?: string }>;
  }

  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  const list = objectPayload.cards ?? objectPayload.items ?? objectPayload.data ?? objectPayload.results;
  if (!Array.isArray(list)) {
    return [];
  }

  return list as Array<string | { id?: string }>;
}

function parseListPage(payload: unknown, pageSize: number, currentPage: number): ListPageResult {
  const ids = extractIdsFromPayload(payload)
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (typeof item === 'object' && item !== null && typeof item.id === 'string') {
        return item.id;
      }
      return undefined;
    })
    .filter((value): value is string => Boolean(value));

  let hasNextPage = ids.length >= pageSize;
  let nextPage: number | undefined;

  if (typeof payload === 'object' && payload !== null) {
    const objectPayload = payload as Record<string, unknown>;
    const directNextPage = objectPayload.nextPage;
    if (typeof directNextPage === 'number' && Number.isFinite(directNextPage) && directNextPage > currentPage) {
      nextPage = directNextPage;
      hasNextPage = true;
    } else if (typeof directNextPage === 'string') {
      const parsed = Number.parseInt(directNextPage, 10);
      if (Number.isFinite(parsed) && parsed > currentPage) {
        nextPage = parsed;
        hasNextPage = true;
      }
    }

    const pagination = objectPayload.pagination;
    if (typeof pagination === 'object' && pagination !== null) {
      const page = typeof (pagination as Record<string, unknown>).page === 'number'
        ? (pagination as Record<string, unknown>).page as number
        : currentPage;
      const totalPages =
        toNumber((pagination as Record<string, unknown>).pageCount) ??
        toNumber((pagination as Record<string, unknown>).totalPages);
      const explicitHasNext = (pagination as Record<string, unknown>).hasNextPage;

      if (typeof explicitHasNext === 'boolean') {
        hasNextPage = explicitHasNext;
      } else if (totalPages !== undefined) {
        hasNextPage = page < totalPages;
      }

      if (hasNextPage && nextPage === undefined) {
        nextPage = page + 1;
      }
    }
  }

  const result: ListPageResult = {
    ids,
    hasNextPage
  };

  if (nextPage !== undefined) {
    result.nextPage = nextPage;
  }

  return result;
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

export class TcgdexPriceSourceProvider implements PriceSourceProvider {
  private readonly deps: TcgdexProviderDependencies;

  constructor(
    private readonly options: TcgdexProviderOptions,
    deps?: Partial<TcgdexProviderDependencies>
  ) {
    this.deps = {
      fetchImpl: deps?.fetchImpl ?? fetch,
      sleep: deps?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
      random: deps?.random ?? Math.random,
      nowMs: deps?.nowMs ?? (() => Date.now())
    };
  }

  async fetch(context: StartRunResult): Promise<PriceSourceFetchResult> {
    const startedAt = this.deps.nowMs();
    const metrics: PriceSourceFetchMetrics = {
      totalCardsScanned: 0,
      cardsWithDetailFetched: 0,
      cardsSuccessfullyMapped: 0,
      cardsSkipped: 0,
      skipReasonCounts: {},
      requestFailures: 0,
      retryCount: 0,
      upstreamFailureRate: 0,
      runDurationMs: 0
    };

    const cardIds = await this.fetchAllCardIds(metrics);
    metrics.totalCardsScanned = cardIds.length;

    const records: RawPriceRecord[] = [];

    await runWithConcurrency(cardIds, this.options.detailConcurrency, async (cardId) => {
      try {
        const detail = await this.fetchCardDetail(cardId, metrics);
        metrics.cardsWithDetailFetched += 1;

        const mapped = mapTcgdexCardToRawRecord(detail, context.asOf);
        if (mapped.skipReason) {
          metrics.cardsSkipped += 1;
          incrementCounter(metrics.skipReasonCounts, mapped.skipReason);
          return;
        }

        if (mapped.usedFallbackTimestamp) {
          incrementCounter(metrics.skipReasonCounts, 'invalid timestamp');
        }

        if (mapped.record) {
          records.push(mapped.record);
          metrics.cardsSuccessfullyMapped += 1;
        }
      } catch (error) {
        metrics.requestFailures += 1;
        logWarn('TCGdex card detail request failed; continuing ingestion.', {
          step: 'FetchRaw',
          source: 'tcgdex',
          cardId,
          runId: context.runId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    const denominator = Math.max(1, metrics.totalCardsScanned);
    metrics.upstreamFailureRate = metrics.requestFailures / denominator;
    metrics.runDurationMs = this.deps.nowMs() - startedAt;

    if (metrics.cardsSuccessfullyMapped === 0) {
      throw new Error('TCGdex ingestion produced no valid canonical price records.');
    }

    if (metrics.upstreamFailureRate > this.options.failureRateThreshold) {
      throw new Error(
        `TCGdex upstream failure rate ${metrics.upstreamFailureRate.toFixed(2)} exceeded threshold ${this.options.failureRateThreshold.toFixed(2)}.`
      );
    }

    return {
      records,
      metrics
    };
  }

  private async fetchAllCardIds(metrics: PriceSourceFetchMetrics): Promise<string[]> {
    const collected = new Set<string>();
    let page = 1;
    let pagesFetched = 0;
    let hasNextPage = true;

    while (hasNextPage) {
      if (this.options.maxPages > 0 && pagesFetched >= this.options.maxPages) {
        break;
      }

      const listUrl = this.buildListUrl(page);
      let payload: unknown;
      try {
        payload = await this.requestJson(listUrl, metrics);
      } catch (error) {
        metrics.requestFailures += 1;
        throw new Error(
          `Failed to fetch TCGdex card list page ${page}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const parsedPage = parseListPage(payload, this.options.pageSize, page);
      for (const id of parsedPage.ids) {
        if (id.trim().length > 0) {
          collected.add(id.trim());
        }
      }

      hasNextPage = parsedPage.hasNextPage;
      page = parsedPage.nextPage ?? page + 1;
      pagesFetched += 1;
    }

    return [...collected];
  }

  private buildListUrl(page: number): URL {
    const url = this.buildApiUrl(this.options.listPath);
    const pageValue = String(page);
    const pageSizeValue = String(this.options.pageSize);
    url.searchParams.set('pagination:page', pageValue);
    url.searchParams.set('pagination:itemsPerPage', pageSizeValue);
    return url;
  }

  private buildDetailUrl(cardId: string): URL {
    const encodedCardId = encodeURIComponent(cardId);
    const path = this.options.detailPathTemplate.replace('{id}', encodedCardId);
    return this.buildApiUrl(path);
  }

  private buildApiUrl(path: string): URL {
    const normalizedBase = this.options.baseUrl.endsWith('/')
      ? this.options.baseUrl
      : `${this.options.baseUrl}/`;
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    return new URL(normalizedPath, normalizedBase);
  }

  private async fetchCardDetail(cardId: string, metrics: PriceSourceFetchMetrics): Promise<TcgdexCardDetail> {
    const detailUrl = this.buildDetailUrl(cardId);
    const payload = await this.requestJson(detailUrl, metrics);
    return payload as TcgdexCardDetail;
  }

  private isRetriableStatus(status: number): boolean {
    if (status === 408 || status === 429) {
      return true;
    }
    return status >= 500 && status <= 599;
  }

  private isRetriableError(error: unknown): boolean {
    if (error instanceof HttpStatusError) {
      return this.isRetriableStatus(error.status);
    }
    if (error instanceof DOMException) {
      return error.name === 'AbortError';
    }
    return error instanceof TypeError;
  }

  private async requestJson(url: URL, metrics: PriceSourceFetchMetrics): Promise<unknown> {
    const maxAttempts = this.options.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

      try {
        const response = await this.deps.fetchImpl(url.toString(), {
          method: 'GET',
          signal: controller.signal
        });

        if (!response.ok) {
          throw new HttpStatusError(response.status, `HTTP ${response.status} for ${url.toString()}`);
        }

        return (await response.json()) as unknown;
      } catch (error) {
        if (attempt >= maxAttempts || !this.isRetriableError(error)) {
          throw error;
        }

        metrics.retryCount += 1;
        const exponential = this.options.retryBaseDelayMs * 2 ** (attempt - 1);
        const jitter = Math.floor(this.deps.random() * this.options.retryBaseDelayMs);
        await this.deps.sleep(exponential + jitter);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`Request exhausted retries for ${url.toString()}`);
  }
}
