import { AppError, createSuccess } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import { jsonResponse } from '../../middleware/response';

export async function getCardByIdRoute(
  cardId: string,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const card = await deps.repo.getCardById(cardId);
  if (!card) {
    throw new AppError('CARD_NOT_FOUND', 'Card not found.', 404);
  }

  return jsonResponse(200, createSuccess(card));
}
