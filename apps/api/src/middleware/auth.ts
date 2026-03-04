import { AppError } from '@pokepredict/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export function getUserIdFromHeader(event: APIGatewayProxyEventV2): string {
  const userId = event.headers['x-user-id'] ?? event.headers['X-User-Id'];
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'Missing x-user-id header', 401);
  }
  return userId;
}
