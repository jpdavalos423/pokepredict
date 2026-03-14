import type {
  CardDetail,
  HoldingResponse,
  LatestPriceResponse
} from '@pokepredict/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { PortfolioRepository } from '../src/data/portfolio-repository';
import type { AlertsRepository } from '../src/data/alerts-repository';
import type { ApiReadRepository, PaginatedItems } from '../src/data/read-repository';
import { createHandler } from '../src/handler';
import { computeHoldingRequestHash } from '../src/routes/portfolio/utils';

function createEvent(options: {
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}): APIGatewayProxyEventV2 {
  const rawQueryString = new URLSearchParams(options.query ?? {}).toString();
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: options.path,
    rawQueryString,
    queryStringParameters: options.query,
    headers: options.headers ?? {},
    body: options.body ? JSON.stringify(options.body) : undefined,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: options.method,
        path: options.path,
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

function parseBody<T>(result: { body?: string | undefined }): T {
  return JSON.parse(result.body ?? '{}') as T;
}

function createReadRepoMock(): ApiReadRepository {
  return {
    listCardsBySet: vi.fn(async (): Promise<PaginatedItems<never>> => ({ items: [] })),
    listCardsByNamePrefix: vi.fn(async (): Promise<PaginatedItems<never>> => ({ items: [] })),
    getCardById: vi.fn(async (): Promise<CardDetail | null> => ({
      cardId: 'sv3-198',
      name: 'Venusaur ex',
      set: { id: 'sv3', name: '151' },
      number: '198'
    })),
    getLatestPrice: vi.fn(async (): Promise<LatestPriceResponse | null> => null),
    getPriceHistory: vi.fn(async () => []),
    getLatestSignal: vi.fn(async () => null)
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

function createTestHandler(
  readRepo: ApiReadRepository,
  portfolioRepo: PortfolioRepository
) {
  return createHandler(
    () =>
      ({
        repo: readRepo,
        portfolioRepo,
        alertsRepo: createAlertsRepoMock(),
        cursorSigningSecret: 'test-cursor-secret',
        now: () => new Date('2026-03-05T10:00:00.000Z')
      }) satisfies ApiDependencies
  );
}

const validHoldingPayload = {
  cardId: 'sv3-198',
  qty: 2,
  variant: 'raw',
  grade: null,
  condition: 'NM',
  buyPriceCents: 1000,
  buyDate: '2026-03-01',
  notes: 'local trade'
};

describe('Phase 3 portfolio routes', () => {
  it('requires x-user-id for all portfolio endpoints', async () => {
    const handler = createTestHandler(createReadRepoMock(), createPortfolioRepoMock());

    const getResult = await handler(createEvent({ path: '/portfolio', method: 'GET' }));
    expect(getResult.statusCode).toBe(401);

    const postResult = await handler(
      createEvent({
        path: '/portfolio/holdings',
        method: 'POST',
        body: validHoldingPayload
      })
    );
    expect(postResult.statusCode).toBe(401);

    const deleteResult = await handler(
      createEvent({ path: '/portfolio/holdings/h1', method: 'DELETE' })
    );
    expect(deleteResult.statusCode).toBe(401);
  });

  it('rejects whitespace-only x-user-id header', async () => {
    const handler = createTestHandler(createReadRepoMock(), createPortfolioRepoMock());
    const result = await handler(
      createEvent({
        path: '/portfolio',
        method: 'GET',
        headers: { 'x-user-id': '   ' }
      })
    );

    expect(result.statusCode).toBe(401);
  });

  it('creates holding successfully without idempotency key', async () => {
    const readRepo = createReadRepoMock();
    const portfolioRepo = createPortfolioRepoMock();
    const handler = createTestHandler(readRepo, portfolioRepo);

    const result = await handler(
      createEvent({
        path: '/portfolio/holdings',
        method: 'POST',
        headers: { 'x-user-id': 'user_1' },
        body: validHoldingPayload
      })
    );

    expect(result.statusCode).toBe(201);
    expect(portfolioRepo.createHolding).toHaveBeenCalledTimes(1);

    const body = parseBody<{ ok: boolean; data: HoldingResponse }>(result);
    expect(body.ok).toBe(true);
    expect(body.data.userId).toBe('user_1');
    expect(body.data.qty).toBe(2);
  });

  it('replays idempotent create and returns same holding', async () => {
    const readRepo = createReadRepoMock();
    const portfolioRepo = createPortfolioRepoMock();
    const createWithIdempotency = vi.mocked(portfolioRepo.createHoldingWithIdempotency);
    const requestHash = computeHoldingRequestHash(validHoldingPayload);

    const existing: HoldingResponse = {
      holdingId: '01HOLDINGEXIST',
      userId: 'user_1',
      cardId: 'sv3-198',
      qty: 2,
      variant: 'raw',
      grade: null,
      condition: 'NM',
      buyPriceCents: 1000,
      buyDate: '2026-03-01',
      notes: 'local trade',
      createdAt: '2026-03-05T10:00:00.000Z',
      updatedAt: '2026-03-05T10:00:00.000Z',
      version: 1,
      requestHash
    };

    createWithIdempotency
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(Object.assign(new Error('tx conflict'), { name: 'TransactionCanceledException' }));

    vi.mocked(portfolioRepo.getIdempotencyAlias).mockResolvedValue({
      userId: 'user_1',
      idempotencyKey: 'idem-1',
      holdingId: existing.holdingId,
      requestHash: existing.requestHash ?? '',
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      version: 1,
      entityType: 'IDEMP'
    });
    vi.mocked(portfolioRepo.getHolding).mockResolvedValue(existing);

    const handler = createTestHandler(readRepo, portfolioRepo);

    const first = await handler(
      createEvent({
        path: '/portfolio/holdings',
        method: 'POST',
        headers: { 'x-user-id': 'user_1', 'Idempotency-Key': 'idem-1' },
        body: validHoldingPayload
      })
    );
    expect(first.statusCode).toBe(201);

    const second = await handler(
      createEvent({
        path: '/portfolio/holdings',
        method: 'POST',
        headers: { 'x-user-id': 'user_1', 'Idempotency-Key': 'idem-1' },
        body: validHoldingPayload
      })
    );

    expect(second.statusCode).toBe(201);
    const secondBody = parseBody<{ data: HoldingResponse }>(second);
    expect(secondBody.data.holdingId).toBe(existing.holdingId);
  });

  it('returns 409 IDEMPOTENCY_CONFLICT for same key with different payload', async () => {
    const readRepo = createReadRepoMock();
    const portfolioRepo = createPortfolioRepoMock();

    vi.mocked(portfolioRepo.createHoldingWithIdempotency).mockRejectedValue(
      Object.assign(new Error('tx conflict'), { name: 'TransactionCanceledException' })
    );
    vi.mocked(portfolioRepo.getIdempotencyAlias).mockResolvedValue({
      userId: 'user_1',
      idempotencyKey: 'idem-1',
      holdingId: '01EXISTING',
      requestHash: 'different_hash',
      createdAt: '2026-03-05T10:00:00.000Z',
      updatedAt: '2026-03-05T10:00:00.000Z',
      version: 1,
      entityType: 'IDEMP'
    });

    const handler = createTestHandler(readRepo, portfolioRepo);

    const result = await handler(
      createEvent({
        path: '/portfolio/holdings',
        method: 'POST',
        headers: { 'x-user-id': 'user_1', 'Idempotency-Key': 'idem-1' },
        body: validHoldingPayload
      })
    );

    expect(result.statusCode).toBe(409);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('deletes holding and returns not found on missing holding', async () => {
    const readRepo = createReadRepoMock();
    const repo = createPortfolioRepoMock();
    const deleteMock = vi.mocked(repo.deleteHolding);
    deleteMock
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(
        Object.assign(new Error('missing'), { name: 'ConditionalCheckFailedException' })
      );

    const localHandler = createTestHandler(readRepo, repo);

    const first = await localHandler(
      createEvent({
        path: '/portfolio/holdings/h1',
        method: 'DELETE',
        headers: { 'x-user-id': 'user_1' }
      })
    );
    expect(first.statusCode).toBe(204);

    const second = await localHandler(
      createEvent({
        path: '/portfolio/holdings/h1',
        method: 'DELETE',
        headers: { 'x-user-id': 'user_1' }
      })
    );
    expect(second.statusCode).toBe(404);
    const body = parseBody<{ error?: { code?: string } }>(second);
    expect(body.error?.code).toBe('HOLDING_NOT_FOUND');
  });

  it('returns portfolio with zero market value for holdings missing latest prices', async () => {
    const readRepo = createReadRepoMock();
    const portfolioRepo = createPortfolioRepoMock();

    vi.mocked(portfolioRepo.listHoldingsByUser).mockResolvedValue([
      {
        holdingId: 'h1',
        userId: 'user_1',
        cardId: 'sv3-198',
        qty: 2,
        variant: 'raw',
        grade: null,
        condition: 'NM',
        buyPriceCents: 1000,
        buyDate: '2026-03-01',
        createdAt: '2026-03-04T10:00:00.000Z',
        updatedAt: '2026-03-04T10:00:00.000Z',
        version: 1
      },
      {
        holdingId: 'h2',
        userId: 'user_1',
        cardId: 'sv3-169',
        qty: 1,
        variant: 'raw',
        grade: null,
        condition: 'NM',
        buyPriceCents: 500,
        buyDate: '2026-03-01',
        createdAt: '2026-03-05T09:00:00.000Z',
        updatedAt: '2026-03-05T09:00:00.000Z',
        version: 1
      }
    ]);

    vi.mocked(portfolioRepo.batchGetLatestPrices).mockResolvedValue(
      new Map<string, LatestPriceResponse>([
        [
          'sv3-198',
          {
            cardId: 'sv3-198',
            asOf: '2026-03-05T00:00:00.000Z',
            marketCents: 1200,
            currency: 'USD',
            source: 'fixture'
          }
        ]
      ])
    );

    const handler = createTestHandler(readRepo, portfolioRepo);

    const result = await handler(
      createEvent({
        path: '/portfolio',
        method: 'GET',
        headers: { 'x-user-id': 'user_1' }
      })
    );

    expect(result.statusCode).toBe(200);
    const body = parseBody<{
      data: {
        summary: {
          totalCostBasisCents: number;
          totalMarketValueCents: number;
          unrealizedPnLCents: number;
          unrealizedPnLBps: number;
        };
        holdings: Array<{ holdingId: string; marketValueCents: number; latestPrice: LatestPriceResponse | null }>;
      };
    }>(result);

    expect(body.data.summary.totalCostBasisCents).toBe(2500);
    expect(body.data.summary.totalMarketValueCents).toBe(2400);
    expect(body.data.summary.unrealizedPnLCents).toBe(-100);
    expect(body.data.summary.unrealizedPnLBps).toBe(-400);

    const h2 = body.data.holdings.find((holding) => holding.holdingId === 'h2');
    expect(h2?.marketValueCents).toBe(0);
    expect(h2?.latestPrice).toBeNull();
  });
});
