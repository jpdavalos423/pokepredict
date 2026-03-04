import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface RequestContext {
  method: string;
  path: string;
  requestId: string;
  query: Record<string, string | undefined>;
}

export function parseRequestContext(
  event: APIGatewayProxyEventV2
): RequestContext {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    requestId: event.requestContext.requestId,
    query: event.queryStringParameters ?? {}
  };
}
