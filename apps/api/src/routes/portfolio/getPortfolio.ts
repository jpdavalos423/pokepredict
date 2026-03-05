import { createSuccess, type PortfolioResponse } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import { getUserIdFromHeaders } from '../../middleware/auth';
import type { RequestContext } from '../../middleware/request';
import { jsonResponse } from '../../middleware/response';
import { buildHoldingValuation, summarizePortfolio } from './utils';

export async function getPortfolioRoute(
  req: RequestContext,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserIdFromHeaders(req.headers);

  const holdings = await deps.portfolioRepo.listHoldingsByUser(userId);
  const cardIds = holdings.map((holding) => holding.cardId);
  const latestPricesByCard = await deps.portfolioRepo.batchGetLatestPrices(cardIds);

  const valuationHoldings = holdings
    .map((holding) => {
      const latestPrice = latestPricesByCard.get(holding.cardId) ?? null;
      return buildHoldingValuation(holding, latestPrice);
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const response: PortfolioResponse = {
    summary: summarizePortfolio(valuationHoldings),
    holdings: valuationHoldings
  };

  return jsonResponse(200, createSuccess(response));
}
