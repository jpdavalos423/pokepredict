import { encodeCursor, type CardDetail, type CardListItem, type LatestPriceResponse, type PriceHistoryPoint } from '@pokepredict/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { PortfolioRepository } from '../src/data/portfolio-repository';
import type { AlertsRepository } from '../src/data/alerts-repository';
import { type ApiDependencies } from '../src/dependencies';
import type { ApiReadRepository, PaginatedItems } from '../src/data/read-repository';
import { createHandler } from '../src/handler';

const CURSOR_SECRET = 'test-cursor-secret';

function createEvent(
  path: string,
  query: Record<string, string> = {},
  method = 'GET'
): APIGatewayProxyEventV2 {
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
        method,
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

function parseBody<T>(result: { body?: string | undefined }): T {
  return JSON.parse(result.body ?? '{}') as T;
}

function createRepoMock(): ApiReadRepository {
  return {
    listCardsBySet: vi.fn(async (): Promise<PaginatedItems<CardListItem>> => ({ items: [] })),
    listCardsByNamePrefix: vi.fn(async (): Promise<PaginatedItems<CardListItem>> => ({ items: [] })),
    getCardById: vi.fn(async (): Promise<CardDetail | null> => null),
    getLatestPrice: vi.fn(async (): Promise<LatestPriceResponse | null> => null),
    getPriceHistory: vi.fn(async (): Promise<PriceHistoryPoint[]> => []),
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

function createTestHandler(repo: ApiReadRepository) {
  return createHandler(
    () =>
      ({
        repo,
        portfolioRepo: createPortfolioRepoMock(),
        alertsRepo: createAlertsRepoMock(),
        cursorSigningSecret: CURSOR_SECRET,
        now: () => new Date('2026-03-04T18:00:00.000Z')
      }) satisfies ApiDependencies
  );
}

describe('Phase 2 API routes', () => {
  it('GET /cards supports set-only browse', async () => {
    const repo = createRepoMock();
    vi.mocked(repo.listCardsBySet).mockResolvedValue({
      items: [
        {
          cardId: 'sv3-198',
          name: 'Venusaur ex',
          set: { id: 'sv3', name: '151' },
          number: '198'
        }
      ]
    });

    const handler = createTestHandler(repo);
    const result = await handler(createEvent('/cards', { set: 'sv3' }));

    expect(result.statusCode).toBe(200);
    const body = parseBody<{ data: { items: CardListItem[]; cursor: string | null } }>(result);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.cursor).toBeNull();
    expect(repo.listCardsBySet).toHaveBeenCalledWith({
      setId: 'sv3',
      limit: 25
    });
  });

  it('GET /cards rejects query-only with len < 2', async () => {
    const handler = createTestHandler(createRepoMock());
    const result = await handler(createEvent('/cards', { query: 'a' }));

    expect(result.statusCode).toBe(422);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('GET /cards supports query-only with len >= 2', async () => {
    const repo = createRepoMock();
    const handler = createTestHandler(repo);

    await handler(createEvent('/cards', { query: 'Char' }));

    expect(repo.listCardsByNamePrefix).toHaveBeenCalledWith({
      normalizedQuery: 'char',
      limit: 25
    });
  });

  it('GET /cards supports set+query with len 1', async () => {
    const repo = createRepoMock();
    const handler = createTestHandler(repo);

    const result = await handler(createEvent('/cards', { set: 'sv3', query: 'a' }));

    expect(result.statusCode).toBe(200);
    expect(repo.listCardsBySet).toHaveBeenCalledWith({
      setId: 'sv3',
      normalizedQuery: 'a',
      limit: 25
    });
  });

  it('GET /cards requires set or query', async () => {
    const handler = createTestHandler(createRepoMock());
    const result = await handler(createEvent('/cards'));

    expect(result.statusCode).toBe(422);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('retries dependency initialization after a transient failure', async () => {
    const repo = createRepoMock();
    let attempts = 0;
    const handler = createHandler(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('temporary ssm failure');
      }
      return {
        repo,
        portfolioRepo: createPortfolioRepoMock(),
        alertsRepo: createAlertsRepoMock(),
        cursorSigningSecret: CURSOR_SECRET,
        now: () => new Date('2026-03-04T18:00:00.000Z')
      };
    });

    const first = await handler(createEvent('/cards', { set: 'sv3' }));
    expect(first.statusCode).toBe(500);

    const second = await handler(createEvent('/cards', { set: 'sv3' }));
    expect(second.statusCode).toBe(200);
    expect(attempts).toBe(2);
  });

  it('GET /cards rejects limit > 50', async () => {
    const handler = createTestHandler(createRepoMock());
    const result = await handler(createEvent('/cards', { set: 'sv3', limit: '51' }));

    expect(result.statusCode).toBe(422);
  });

  it('GET /cards supports valid cursor paging', async () => {
    const repo = createRepoMock();
    vi.mocked(repo.listCardsBySet)
      .mockResolvedValueOnce({
        items: [
          {
            cardId: 'sv3-198',
            name: 'Venusaur ex',
            set: { id: 'sv3', name: '151' },
            number: '198'
          }
        ],
        lastEvaluatedKey: {
          pk: 'CARD#sv3-198',
          sk: 'META'
        }
      })
      .mockResolvedValueOnce({
        items: [
          {
            cardId: 'sv3-169',
            name: 'Charizard ex',
            set: { id: 'sv3', name: '151' },
            number: '169'
          }
        ]
      });

    const handler = createTestHandler(repo);

    const first = await handler(createEvent('/cards', { set: 'sv3', limit: '2' }));
    const firstBody = parseBody<{ data: { cursor: string | null } }>(first);
    expect(firstBody.data.cursor).toBeTruthy();

    const second = await handler(
      createEvent('/cards', {
        set: 'sv3',
        limit: '2',
        cursor: firstBody.data.cursor ?? ''
      })
    );

    expect(second.statusCode).toBe(200);
    expect(repo.listCardsBySet).toHaveBeenNthCalledWith(2, {
      setId: 'sv3',
      limit: 2,
      exclusiveStartKey: {
        pk: 'CARD#sv3-198',
        sk: 'META'
      }
    });
  });

  it('GET /cards rejects tampered cursor signature', async () => {
    const token = encodeCursor(
      {
        v: 1,
        route: '/cards',
        index: 'gsi1',
        params: { set: 'sv3' },
        limit: 25,
        lek: { pk: 'CARD#sv3-198', sk: 'META' }
      },
      CURSOR_SECRET
    );

    const tampered = `${token.slice(0, -1)}x`;
    const handler = createTestHandler(createRepoMock());
    const result = await handler(
      createEvent('/cards', {
        set: 'sv3',
        cursor: tampered
      })
    );

    expect(result.statusCode).toBe(400);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('INVALID_CURSOR');
  });

  it('GET /cards rejects cursor route mismatch', async () => {
    const token = encodeCursor(
      {
        v: 1,
        route: '/not-cards',
        index: 'gsi1',
        params: { set: 'sv3' },
        limit: 25,
        lek: { pk: 'CARD#sv3-198', sk: 'META' }
      },
      CURSOR_SECRET
    );

    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards', { set: 'sv3', cursor: token })
    );

    expect(result.statusCode).toBe(400);
  });

  it('GET /cards rejects cursor index mismatch', async () => {
    const token = encodeCursor(
      {
        v: 1,
        route: '/cards',
        index: 'gsi1',
        params: { query: 'char' },
        limit: 25,
        lek: { pk: 'CARD#sv3-198', sk: 'META' }
      },
      CURSOR_SECRET
    );

    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards', { query: 'char', cursor: token })
    );

    expect(result.statusCode).toBe(400);
  });

  it('GET /cards rejects cursor params mismatch', async () => {
    const token = encodeCursor(
      {
        v: 1,
        route: '/cards',
        index: 'gsi1',
        params: { set: 'sv2' },
        limit: 25,
        lek: { pk: 'CARD#sv3-198', sk: 'META' }
      },
      CURSOR_SECRET
    );

    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards', { set: 'sv3', cursor: token })
    );

    expect(result.statusCode).toBe(400);
  });

  it('GET /cards rejects cursor limit mismatch', async () => {
    const token = encodeCursor(
      {
        v: 1,
        route: '/cards',
        index: 'gsi1',
        params: { set: 'sv3' },
        limit: 10,
        lek: { pk: 'CARD#sv3-198', sk: 'META' }
      },
      CURSOR_SECRET
    );

    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards', { set: 'sv3', limit: '25', cursor: token })
    );

    expect(result.statusCode).toBe(400);
  });

  it('GET /cards/{cardId} returns card detail when found', async () => {
    const repo = createRepoMock();
    vi.mocked(repo.getCardById).mockResolvedValue({
      cardId: 'sv3-198',
      name: 'Venusaur ex',
      set: { id: 'sv3', name: '151' },
      number: '198'
    });

    const result = await createTestHandler(repo)(createEvent('/cards/sv3-198'));

    expect(result.statusCode).toBe(200);
  });

  it('GET /cards/{cardId} returns 404 when missing', async () => {
    const result = await createTestHandler(createRepoMock())(createEvent('/cards/missing-id'));
    expect(result.statusCode).toBe(404);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('CARD_NOT_FOUND');
  });

  it('GET /cards/{cardId}/price/latest returns latest price when found', async () => {
    const repo = createRepoMock();
    vi.mocked(repo.getLatestPrice).mockResolvedValue({
      cardId: 'sv3-198',
      asOf: '2026-03-04T18:00:00.000Z',
      marketCents: 12000,
      marketPrice: 120,
      currency: 'USD',
      source: 'fixture'
    });

    const result = await createTestHandler(repo)(
      createEvent('/cards/sv3-198/price/latest')
    );

    expect(result.statusCode).toBe(200);
    const body = parseBody<{ data: LatestPriceResponse }>(result);
    expect(body.data.marketPrice).toBe(body.data.marketCents / 100);
  });

  it('GET /cards/{cardId}/price/latest returns 404 when missing', async () => {
    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards/sv3-198/price/latest')
    );

    expect(result.statusCode).toBe(404);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('PRICE_NOT_FOUND');
  });

  it('GET /cards/{cardId}/signals/latest returns latest signal when found', async () => {
    const repo = createRepoMock();
    vi.mocked(repo.getLatestSignal).mockResolvedValue({
      cardId: 'sv3-198',
      asOfDate: '2026-03-04',
      ret7dBps: 120,
      ret30dBps: 410,
      vol30dBps: 235,
      trend: 'UPTREND'
    });

    const result = await createTestHandler(repo)(
      createEvent('/cards/sv3-198/signals/latest')
    );

    expect(result.statusCode).toBe(200);
  });

  it('GET /cards/{cardId}/signals/latest returns 404 when missing', async () => {
    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards/sv3-198/signals/latest')
    );

    expect(result.statusCode).toBe(404);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('SIGNALS_NOT_FOUND');
  });

  it('GET /cards/{cardId}/prices returns ordered points for valid range', async () => {
    const repo = createRepoMock();
    vi.mocked(repo.getPriceHistory).mockResolvedValue([
      {
        ts: '2026-03-03T18:00:00.000Z',
        marketCents: 11000,
        marketPrice: 110,
        currency: 'USD',
        source: 'fixture'
      },
      {
        ts: '2026-03-04T18:00:00.000Z',
        marketCents: 12000,
        marketPrice: 120,
        currency: 'USD',
        source: 'fixture'
      }
    ]);

    const result = await createTestHandler(repo)(
      createEvent('/cards/sv3-198/prices', { range: '30d' })
    );

    expect(result.statusCode).toBe(200);
    const body = parseBody<{ data: { points: PriceHistoryPoint[] } }>(result);
    expect(body.data.points).toHaveLength(2);
    expect(body.data.points[0]?.ts).toBe('2026-03-03T18:00:00.000Z');
    expect(body.data.points[1]?.ts).toBe('2026-03-04T18:00:00.000Z');
    expect(body.data.points[0]?.marketPrice).toBe(body.data.points[0]?.marketCents / 100);
    expect(body.data.points[1]?.marketPrice).toBe(body.data.points[1]?.marketCents / 100);
  });

  it('GET /cards/{cardId}/prices rejects invalid range', async () => {
    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards/sv3-198/prices', { range: '7d' })
    );

    expect(result.statusCode).toBe(422);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('GET /cards/{cardId}/prices returns empty points when no history exists', async () => {
    const result = await createTestHandler(createRepoMock())(
      createEvent('/cards/sv3-198/prices', { range: '90d' })
    );

    expect(result.statusCode).toBe(200);
    const body = parseBody<{ data: { points: PriceHistoryPoint[] } }>(result);
    expect(body.data.points).toEqual([]);
  });
});
