import { AppError } from '@pokepredict/shared';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { parseRequestContext } from './middleware/request';
import { errorResponse } from './middleware/response';
import { healthRoute } from './routes/health';

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const req = parseRequestContext(event);

  try {
    if (req.method === 'GET' && req.path === '/health') {
      return healthRoute();
    }

    throw new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.path}`, 404);
  } catch (error) {
    return errorResponse(error, req.requestId);
  }
}
