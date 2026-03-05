import { AppError } from '@pokepredict/shared';

export function getUserIdFromHeaders(
  headers: Record<string, string | undefined>
): string {
  const rawUserId = headers['x-user-id'] ?? headers['X-User-Id'];
  const userId = rawUserId?.trim();
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'Missing x-user-id header', 401);
  }
  return userId;
}
