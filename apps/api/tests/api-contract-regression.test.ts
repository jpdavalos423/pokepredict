import type {
  CardDetail,
  CardListItem,
  LatestPriceResponse,
  PriceHistoryPoint,
  Signal
} from '@pokepredict/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { AlertsRepository } from '../src/data/alerts-repository';
import type { PortfolioRepository } from '../src/data/portfolio-repository';
import type { ApiReadRepository, PaginatedItems } from '../src/data/read-repository';
import type { ApiDependencies } from '../src/dependencies';
import { createHandler } from '../src/handler';

function createEvent(path: string, query: Record<string, string> = {}): APIGatewayProxyEventV2 {
  const rawQueryString = new URLSearchParams(query).toString();
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString,
    queryStringParameters: Object.keys(query).length > 0 ? query : undefined,
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest'
      },
      requestId: 'req_123',
      routeKey: '$default',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now()
    },
    isBase64Encoded: false
  } as APIGatewayProxyEventV2;
}

function parseBody<T>(body: string | undefined): T {
  return JSON.parse(body ?? '{}') as T;
}

function createReadRepoMock(): ApiReadRepository {
  return {
    listCardsBySet: vi.fn(async (): Promise<PaginatedItems<CardListItem>> => ({ items: [] })),
    listCardsByNamePrefix: vi.fn(async (): Promise<PaginatedItems<CardListItem>> => ({ items: [] })),
    getCardById: vi.fn(async (): Promise<CardDetail | null> => null),
    getLatestPrice: vi.fn(async (): Promise<LatestPriceResponse | null> => null),
    getPriceHistory: vi.fn(async (): Promise<PriceHistoryPoint[]> => []),
    getLatestSignal: vi.fn(async (): Promise<Signal | null> => null)
  };
}

function createPortfolioRepoMock(): PortfolioRepository {
  return {
    createHolding: vi.fn(async () => {}),
    createHoldingWithIdempotency: vi.fn(async () => {}),
    getHolding: vi.fn(async () => null),
    deleteHolding: vi.fn(async () => {}),
    getIdempotencyAlias: vi.fn(async () => null),
    listHoldingsByUser: vi.fn(async () => []),
    batchGetLatestPrices: vi.fn(async () => new Map())
  };
}

function createAlertsRepoMock(): AlertsRepository {
  return {
    createAlert: vi.fn(async () => {}),
    createAlertWithIdempotency: vi.fn(async () => {}),
    getAlert: vi.fn(async () => null),
    deleteAlert: vi.fn(async () => {}),
    getIdempotencyAlias: vi.fn(async () => null),
    listAlertsByUser: vi.fn(async () => [])
  };
}

function createTestHandler(repo: ApiReadRepository) {
  return createHandler(
    () =>
      ({
        repo,
        portfolioRepo: createPortfolioRepoMock(),
        alertsRepo: createAlertsRepoMock(),
        cursorSigningSecret: 'test-cursor-secret',
        now: () => new Date('2026-03-12T00:00:00.000Z')
      }) satisfies ApiDependencies
  );
}

describe('API contract regression', () => {
  it('keeps /cards/{cardId}/price/latest response shape unchanged', async () => {
    const repo = createReadRepoMock();
    vi.mocked(repo.getLatestPrice).mockResolvedValue({
      cardId: 'sv3-198',
      asOf: '2026-03-11T06:00:00.000Z',
      marketCents: 11000,
      lowCents: 10500,
      highCents: 11500,
      currency: 'USD',
      source: 'tcgdex'
    });

    const result = await createTestHandler(repo)(createEvent('/cards/sv3-198/price/latest'));
    expect(result.statusCode).toBe(200);

    const body = parseBody<unknown>(result.body);
    expect(body).toEqual({
      ok: true,
      data: {
        cardId: 'sv3-198',
        asOf: '2026-03-11T06:00:00.000Z',
        marketCents: 11000,
        lowCents: 10500,
        highCents: 11500,
        currency: 'USD',
        source: 'tcgdex'
      },
      error: null
    });
  });

  it('keeps /cards/{cardId}/prices response shape unchanged with stored snapshots', async () => {
    const repo = createReadRepoMock();
    vi.mocked(repo.getPriceHistory).mockResolvedValue([
      {
        ts: '2026-03-10T06:00:00.000Z',
        marketCents: 10000,
        currency: 'USD',
        source: 'tcgdex'
      },
      {
        ts: '2026-03-11T06:00:00.000Z',
        marketCents: 11000,
        currency: 'USD',
        source: 'tcgdex'
      }
    ]);

    const result = await createTestHandler(repo)(createEvent('/cards/sv3-198/prices', { range: '30d' }));
    expect(result.statusCode).toBe(200);

    const body = parseBody<unknown>(result.body);
    expect(body).toEqual({
      ok: true,
      data: {
        cardId: 'sv3-198',
        range: '30d',
        from: '2026-02-10T00:00:00.000Z',
        to: '2026-03-12T00:00:00.000Z',
        points: [
          {
            ts: '2026-03-10T06:00:00.000Z',
            marketCents: 10000,
            currency: 'USD',
            source: 'tcgdex'
          },
          {
            ts: '2026-03-11T06:00:00.000Z',
            marketCents: 11000,
            currency: 'USD',
            source: 'tcgdex'
          }
        ]
      },
      error: null
    });
  });

  it('keeps /cards/{cardId}/signals/latest response shape unchanged', async () => {
    const repo = createReadRepoMock();
    vi.mocked(repo.getLatestSignal).mockResolvedValue({
      cardId: 'sv3-198',
      asOfDate: '2026-03-11',
      ret7dBps: 120,
      ret30dBps: 410,
      vol30dBps: 235,
      trend: 'UPTREND'
    });

    const result = await createTestHandler(repo)(createEvent('/cards/sv3-198/signals/latest'));
    expect(result.statusCode).toBe(200);

    const body = parseBody<unknown>(result.body);
    expect(body).toEqual({
      ok: true,
      data: {
        cardId: 'sv3-198',
        asOfDate: '2026-03-11',
        ret7dBps: 120,
        ret30dBps: 410,
        vol30dBps: 235,
        trend: 'UPTREND'
      },
      error: null
    });
  });
});
