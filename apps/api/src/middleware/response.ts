import { AppError, createFailure } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';

export function jsonResponse(
  statusCode: number,
  body: unknown
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

export function errorResponse(
  error: unknown,
  requestId: string
): APIGatewayProxyResultV2 {
  if (error instanceof AppError) {
    return jsonResponse(error.statusCode, createFailure(error, requestId));
  }

  const internalError = new AppError(
    'INTERNAL_ERROR',
    'Unexpected server error',
    500
  );
  return jsonResponse(500, createFailure(internalError, requestId));
}
