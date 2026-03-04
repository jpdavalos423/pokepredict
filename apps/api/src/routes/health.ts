import { createSuccess } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse } from '../middleware/response';

export function healthRoute(): APIGatewayProxyResultV2 {
  return jsonResponse(
    200,
    createSuccess({
      service: 'pokepredict-api',
      status: 'ok'
    })
  );
}
