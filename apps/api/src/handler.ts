import { AppError } from '@pokepredict/shared';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createApiDependencies, type ApiDependencies } from './dependencies';
import { parseRequestContext } from './middleware/request';
import { errorResponse } from './middleware/response';
import { getCardByIdRoute } from './routes/cards/getById';
import { listCardsRoute } from './routes/cards/list';
import { healthRoute } from './routes/health';
import { createHoldingRoute } from './routes/portfolio/createHolding';
import { deleteHoldingRoute } from './routes/portfolio/deleteHolding';
import { getPortfolioRoute } from './routes/portfolio/getPortfolio';
import { priceHistoryRoute } from './routes/prices/history';
import { latestPriceRoute } from './routes/prices/latest';

type DependenciesFactory = () => ApiDependencies | Promise<ApiDependencies>;

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AppError('BAD_REQUEST', 'Path parameter is not valid URI encoding.', 400);
  }
}

export function createHandler(factory: DependenciesFactory = createApiDependencies) {
  let depsPromise: Promise<ApiDependencies> | undefined;

  async function getDeps(): Promise<ApiDependencies> {
    if (!depsPromise) {
      depsPromise = Promise.resolve(factory()).catch((error) => {
        depsPromise = undefined;
        throw error;
      });
    }
    return depsPromise;
  }

  return async function apiHandler(
    event: APIGatewayProxyEventV2
  ): Promise<APIGatewayProxyResultV2> {
    const req = parseRequestContext(event);

    try {
      if (req.method === 'GET' && req.path === '/health') {
        return healthRoute();
      }

      if (req.method === 'GET' && req.path === '/cards') {
        return await listCardsRoute(req, await getDeps());
      }

      if (req.method === 'GET' && req.path === '/portfolio') {
        return await getPortfolioRoute(req, await getDeps());
      }

      if (req.method === 'POST' && req.path === '/portfolio/holdings') {
        return await createHoldingRoute(req, await getDeps());
      }

      if (req.method === 'GET') {
        const latestMatch = req.path.match(/^\/cards\/([^/]+)\/price\/latest$/);
        if (latestMatch?.[1]) {
          return await latestPriceRoute(decodePathSegment(latestMatch[1]), await getDeps());
        }

        const historyMatch = req.path.match(/^\/cards\/([^/]+)\/prices$/);
        if (historyMatch?.[1]) {
          return await priceHistoryRoute(req, decodePathSegment(historyMatch[1]), await getDeps());
        }

        const cardMatch = req.path.match(/^\/cards\/([^/]+)$/);
        if (cardMatch?.[1]) {
          return await getCardByIdRoute(decodePathSegment(cardMatch[1]), await getDeps());
        }
      }

      if (req.method === 'DELETE') {
        const deleteHoldingMatch = req.path.match(/^\/portfolio\/holdings\/([^/]+)$/);
        if (deleteHoldingMatch?.[1]) {
          return await deleteHoldingRoute(
            req,
            await getDeps(),
            decodePathSegment(deleteHoldingMatch[1])
          );
        }
      }

      throw new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.path}`, 404);
    } catch (error) {
      return errorResponse(error, req.requestId);
    }
  };
}

export const handler = createHandler();
