import { createSuccess, type AlertsListResponse } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import { getUserIdFromHeaders } from '../../middleware/auth';
import type { RequestContext } from '../../middleware/request';
import { jsonResponse } from '../../middleware/response';

export async function getAlertsRoute(
  req: RequestContext,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserIdFromHeaders(req.headers);
  const alerts = await deps.alertsRepo.listAlertsByUser(userId);

  const response: AlertsListResponse = { alerts };
  return jsonResponse(200, createSuccess(response));
}
