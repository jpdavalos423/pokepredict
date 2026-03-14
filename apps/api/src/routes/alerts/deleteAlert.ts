import { AppError } from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import { isConditionalWriteConflict } from '../../data/portfolio-repository';
import { getUserIdFromHeaders } from '../../middleware/auth';
import type { RequestContext } from '../../middleware/request';
import { noContentResponse } from '../../middleware/response';

export async function deleteAlertRoute(
  req: RequestContext,
  deps: ApiDependencies,
  alertId: string
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserIdFromHeaders(req.headers);
  const alert = await deps.alertsRepo.getAlert(userId, alertId);

  if (!alert) {
    throw new AppError('ALERT_NOT_FOUND', 'Alert not found.', 404);
  }

  try {
    await deps.alertsRepo.deleteAlert(alert);
  } catch (error) {
    if (isConditionalWriteConflict(error)) {
      throw new AppError('ALERT_NOT_FOUND', 'Alert not found.', 404);
    }
    throw error;
  }

  return noContentResponse();
}
