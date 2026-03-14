import type { AlertResponse, CardDetail, LatestPriceResponse } from '@pokepredict/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import type { AlertsRepository } from '../src/data/alerts-repository';
import type { PortfolioRepository } from '../src/data/portfolio-repository';
import type { ApiReadRepository, PaginatedItems } from '../src/data/read-repository';
import type { ApiDependencies } from '../src/dependencies';
import { createHandler } from '../src/handler';
import { computeAlertRequestHash } from '../src/routes/alerts/utils';

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
  alertsRepo: AlertsRepository
) {
  return createHandler(
    () =>
      ({
        repo: readRepo,
        portfolioRepo: createPortfolioRepoMock(),
        alertsRepo,
        cursorSigningSecret: 'test-cursor-secret',
        now: () => new Date('2026-03-12T10:00:00.000Z')
      }) satisfies ApiDependencies
  );
}

const validAlertPayload = {
  cardId: 'sv3-198',
  type: 'PRICE_ABOVE',
  thresholdCents: 12000,
  cooldownHours: 24,
  notifyEmail: 'user@example.com'
} as const;

describe('Phase 5 alerts routes', () => {
  it('requires x-user-id for all alert endpoints', async () => {
    const handler = createTestHandler(createReadRepoMock(), createAlertsRepoMock());

    const getResult = await handler(createEvent({ path: '/alerts', method: 'GET' }));
    expect(getResult.statusCode).toBe(401);

    const postResult = await handler(
      createEvent({
        path: '/alerts',
        method: 'POST',
        body: validAlertPayload
      })
    );
    expect(postResult.statusCode).toBe(401);

    const deleteResult = await handler(
      createEvent({ path: '/alerts/a1', method: 'DELETE' })
    );
    expect(deleteResult.statusCode).toBe(401);
  });

  it('creates alert successfully without idempotency key', async () => {
    const alertsRepo = createAlertsRepoMock();
    const handler = createTestHandler(createReadRepoMock(), alertsRepo);

    const result = await handler(
      createEvent({
        path: '/alerts',
        method: 'POST',
        headers: { 'x-user-id': 'user_1' },
        body: validAlertPayload
      })
    );

    expect(result.statusCode).toBe(201);
    expect(alertsRepo.createAlert).toHaveBeenCalledTimes(1);
  });

  it('replays idempotent create and returns same alert', async () => {
    const alertsRepo = createAlertsRepoMock();
    const createWithIdempotency = vi.mocked(alertsRepo.createAlertWithIdempotency);
    const requestHash = computeAlertRequestHash(validAlertPayload);

    const existing: AlertResponse = {
      alertId: '01ALERTEXIST',
      userId: 'user_1',
      cardId: 'sv3-198',
      type: 'PRICE_ABOVE',
      thresholdCents: 12000,
      cooldownHours: 24,
      notifyEmail: 'user@example.com',
      enabled: true,
      createdAt: '2026-03-12T10:00:00.000Z',
      updatedAt: '2026-03-12T10:00:00.000Z',
      version: 1,
      requestHash
    };

    createWithIdempotency
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(Object.assign(new Error('tx conflict'), { name: 'TransactionCanceledException' }));

    vi.mocked(alertsRepo.getIdempotencyAlias).mockResolvedValue({
      userId: 'user_1',
      idempotencyKey: 'idem-1',
      alertId: existing.alertId,
      requestHash,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
      version: 1,
      entityType: 'IDEMP'
    });

    vi.mocked(alertsRepo.getAlert).mockResolvedValue(existing);
    const handler = createTestHandler(createReadRepoMock(), alertsRepo);

    const first = await handler(
      createEvent({
        path: '/alerts',
        method: 'POST',
        headers: { 'x-user-id': 'user_1', 'Idempotency-Key': 'idem-1' },
        body: validAlertPayload
      })
    );
    expect(first.statusCode).toBe(201);

    const second = await handler(
      createEvent({
        path: '/alerts',
        method: 'POST',
        headers: { 'x-user-id': 'user_1', 'Idempotency-Key': 'idem-1' },
        body: validAlertPayload
      })
    );

    expect(second.statusCode).toBe(201);
    const body = parseBody<{ data: AlertResponse }>(second);
    expect(body.data.alertId).toBe(existing.alertId);
  });

  it('returns 409 IDEMPOTENCY_CONFLICT for same key with different payload', async () => {
    const alertsRepo = createAlertsRepoMock();
    vi.mocked(alertsRepo.createAlertWithIdempotency).mockRejectedValue(
      Object.assign(new Error('tx conflict'), { name: 'TransactionCanceledException' })
    );

    vi.mocked(alertsRepo.getIdempotencyAlias).mockResolvedValue({
      userId: 'user_1',
      idempotencyKey: 'idem-1',
      alertId: '01EXISTING',
      requestHash: 'different_hash',
      createdAt: '2026-03-12T10:00:00.000Z',
      updatedAt: '2026-03-12T10:00:00.000Z',
      version: 1,
      entityType: 'IDEMP'
    });

    const handler = createTestHandler(createReadRepoMock(), alertsRepo);
    const result = await handler(
      createEvent({
        path: '/alerts',
        method: 'POST',
        headers: { 'x-user-id': 'user_1', 'Idempotency-Key': 'idem-1' },
        body: validAlertPayload
      })
    );

    expect(result.statusCode).toBe(409);
    const body = parseBody<{ error?: { code?: string } }>(result);
    expect(body.error?.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('returns alert list and excludes idempotency aliases', async () => {
    const alertsRepo = createAlertsRepoMock();
    vi.mocked(alertsRepo.listAlertsByUser).mockResolvedValue([
      {
        alertId: 'a1',
        userId: 'user_1',
        cardId: 'sv3-198',
        type: 'PRICE_ABOVE',
        thresholdCents: 12000,
        cooldownHours: 24,
        notifyEmail: 'user@example.com',
        enabled: true,
        createdAt: '2026-03-12T10:00:00.000Z',
        updatedAt: '2026-03-12T10:00:00.000Z',
        version: 1
      }
    ]);

    const handler = createTestHandler(createReadRepoMock(), alertsRepo);
    const result = await handler(
      createEvent({
        path: '/alerts',
        method: 'GET',
        headers: { 'x-user-id': 'user_1' }
      })
    );

    expect(result.statusCode).toBe(200);
    const body = parseBody<{ data: { alerts: AlertResponse[] } }>(result);
    expect(body.data.alerts).toHaveLength(1);
  });

  it('deletes alert and returns not found when missing', async () => {
    const alertsRepo = createAlertsRepoMock();
    vi.mocked(alertsRepo.getAlert)
      .mockResolvedValueOnce({
        alertId: 'a1',
        userId: 'user_1',
        cardId: 'sv3-198',
        type: 'PRICE_ABOVE',
        thresholdCents: 12000,
        cooldownHours: 24,
        notifyEmail: 'user@example.com',
        enabled: true,
        createdAt: '2026-03-12T10:00:00.000Z',
        updatedAt: '2026-03-12T10:00:00.000Z',
        version: 1
      })
      .mockResolvedValueOnce(null);

    const handler = createTestHandler(createReadRepoMock(), alertsRepo);

    const first = await handler(
      createEvent({
        path: '/alerts/a1',
        method: 'DELETE',
        headers: { 'x-user-id': 'user_1' }
      })
    );
    expect(first.statusCode).toBe(204);

    const second = await handler(
      createEvent({
        path: '/alerts/a1',
        method: 'DELETE',
        headers: { 'x-user-id': 'user_1' }
      })
    );
    expect(second.statusCode).toBe(404);
    const body = parseBody<{ error?: { code?: string } }>(second);
    expect(body.error?.code).toBe('ALERT_NOT_FOUND');
  });
});
