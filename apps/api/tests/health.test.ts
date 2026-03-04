import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../src/handler';

function createEvent(path: string, method = 'GET'): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
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

describe('API handler', () => {
  it('returns health payload', async () => {
    const result = await handler(createEvent('/health'));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body ?? '{}') as {
      ok: boolean;
      data: { status: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  it('returns route not found for unknown endpoint', async () => {
    const result = await handler(createEvent('/missing'));
    expect(result.statusCode).toBe(404);

    const body = JSON.parse(result.body ?? '{}') as {
      error?: { code?: string };
    };
    expect(body.error?.code).toBe('NOT_FOUND');
  });
});
