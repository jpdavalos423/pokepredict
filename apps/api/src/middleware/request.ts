import { AppError } from '@pokepredict/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface RequestContext {
  method: string;
  path: string;
  requestId: string;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  body: string | undefined;
}

function normalizeHeaders(
  headers: APIGatewayProxyEventV2['headers']
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function decodeBody(event: APIGatewayProxyEventV2): string | undefined {
  if (!event.body) {
    return undefined;
  }

  if (!event.isBase64Encoded) {
    return event.body;
  }

  return Buffer.from(event.body, 'base64').toString('utf-8');
}

export function parseRequestContext(
  event: APIGatewayProxyEventV2
): RequestContext {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    requestId: event.requestContext.requestId,
    query: event.queryStringParameters ?? {},
    headers: normalizeHeaders(event.headers),
    body: decodeBody(event)
  };
}

export function parseJsonBody(body: string | undefined): unknown {
  if (!body) {
    throw new AppError('BAD_REQUEST', 'Request body is required.', 400);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AppError('BAD_REQUEST', 'Invalid JSON request body.', 400);
  }
}
