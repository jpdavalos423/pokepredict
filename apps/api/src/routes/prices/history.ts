import { AppError, createSuccess, priceRangeSchema, type PriceRange } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import type { RequestContext } from '../../middleware/request';
import { jsonResponse } from '../../middleware/response';

const RANGE_DAYS: Record<PriceRange, number> = {
  '30d': 30,
  '90d': 90,
  '1y': 365
};

function getRangeWindow(now: Date, range: PriceRange): { from: string; to: string } {
  const to = now.toISOString();
  const fromDate = new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
  return {
    from: fromDate.toISOString(),
    to
  };
}

export async function priceHistoryRoute(
  req: RequestContext,
  cardId: string,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const rangeResult = priceRangeSchema.safeParse(req.query.range);
  if (!rangeResult.success) {
    throw new AppError('VALIDATION_ERROR', 'Invalid range query parameter.', 422, {
      range: ['range must be one of: 30d, 90d, 1y']
    });
  }

  const range = rangeResult.data;
  const window = getRangeWindow(deps.now(), range);
  const points = await deps.repo.getPriceHistory(cardId, window.from, window.to);

  return jsonResponse(
    200,
    createSuccess({
      cardId,
      range,
      from: window.from,
      to: window.to,
      points
    })
  );
}
