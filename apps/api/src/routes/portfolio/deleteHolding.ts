import { AppError } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import { isConditionalWriteConflict } from '../../data/portfolio-repository';
import { getUserIdFromHeaders } from '../../middleware/auth';
import type { RequestContext } from '../../middleware/request';
import { noContentResponse } from '../../middleware/response';

export async function deleteHoldingRoute(
  req: RequestContext,
  deps: ApiDependencies,
  holdingId: string
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserIdFromHeaders(req.headers);

  try {
    await deps.portfolioRepo.deleteHolding(userId, holdingId);
  } catch (error) {
    if (isConditionalWriteConflict(error)) {
      throw new AppError('HOLDING_NOT_FOUND', 'Holding not found.', 404);
    }
    throw error;
  }

  return noContentResponse();
}
