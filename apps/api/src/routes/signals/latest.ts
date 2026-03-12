import { AppError, createSuccess } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import { jsonResponse } from '../../middleware/response';

export async function latestSignalRoute(
  cardId: string,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const signal = await deps.repo.getLatestSignal(cardId);
  if (!signal) {
    throw new AppError('SIGNALS_NOT_FOUND', 'Latest signals not found.', 404);
  }

  return jsonResponse(200, createSuccess(signal));
}
