import { AppError, createSuccess } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import { jsonResponse } from '../../middleware/response';

export async function latestPriceRoute(
  cardId: string,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const latest = await deps.repo.getLatestPrice(cardId);
  if (!latest) {
    throw new AppError('PRICE_NOT_FOUND', 'Latest price not found.', 404);
  }

  return jsonResponse(200, createSuccess(latest));
}
