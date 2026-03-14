import {
  AppError,
  createAlertRequestSchema,
  createSuccess,
  idempotencyKeyHeaderSchema,
  type AlertResponse,
  type CreateAlertRequest
} from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import type { ApiDependencies } from '../../dependencies';
import { isConditionalWriteConflict } from '../../data/portfolio-repository';
import { getUserIdFromHeaders } from '../../middleware/auth';
import { parseJsonBody, type RequestContext } from '../../middleware/request';
import { jsonResponse } from '../../middleware/response';
import { computeAlertRequestHash } from './utils';

function validationError(message: string, details: Record<string, string[]>): AppError {
  return new AppError('VALIDATION_ERROR', message, 422, details);
}

function parseCreateAlertRequest(body: string | undefined): CreateAlertRequest {
  const parsed = createAlertRequestSchema.safeParse(parseJsonBody(body));
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'body';
      details[key] = details[key] ?? [];
      details[key].push(issue.message);
    }
    throw validationError('Invalid alert payload.', details);
  }

  return parsed.data;
}

function parseIdempotencyKey(headers: Record<string, string | undefined>): string | undefined {
  const raw = headers['idempotency-key'] ?? headers['Idempotency-Key'];
  if (!raw) {
    return undefined;
  }

  const parsed = idempotencyKeyHeaderSchema.safeParse(raw);
  if (!parsed.success) {
    throw validationError('Invalid Idempotency-Key header.', {
      'Idempotency-Key': parsed.error.issues.map((issue) => issue.message)
    });
  }

  return parsed.data;
}

function nowIso(deps: ApiDependencies): string {
  return deps.now().toISOString();
}

function toAlertResponse(
  userId: string,
  payload: CreateAlertRequest,
  createdAt: string,
  requestHash?: string
): AlertResponse {
  const alert: AlertResponse = {
    alertId: ulid(),
    userId,
    cardId: payload.cardId,
    type: payload.type,
    thresholdCents: payload.thresholdCents,
    cooldownHours: payload.cooldownHours,
    notifyEmail: payload.notifyEmail,
    enabled: true,
    createdAt,
    updatedAt: createdAt,
    version: 1
  };

  if (requestHash !== undefined) {
    alert.requestHash = requestHash;
  }

  return alert;
}

async function createWithIdempotency(
  deps: ApiDependencies,
  alert: AlertResponse,
  idempotencyKey: string,
  requestHash: string
): Promise<AlertResponse> {
  try {
    await deps.alertsRepo.createAlertWithIdempotency({
      alert,
      idempotencyKey,
      requestHash
    });
    return alert;
  } catch (error) {
    if (!isConditionalWriteConflict(error)) {
      throw error;
    }

    const alias = await deps.alertsRepo.getIdempotencyAlias(alert.userId, idempotencyKey);
    if (!alias) {
      throw new AppError('CONFLICT', 'Unable to create alert due to conflicting write.', 409);
    }

    if (alias.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key is already used with a different payload.',
        409
      );
    }

    const existing = await deps.alertsRepo.getAlert(alert.userId, alias.alertId);
    if (!existing) {
      throw new AppError('CONFLICT', 'Idempotent alert record is missing.', 409);
    }

    return existing;
  }
}

export async function createAlertRoute(
  req: RequestContext,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserIdFromHeaders(req.headers);
  const payload = parseCreateAlertRequest(req.body);
  const idempotencyKey = parseIdempotencyKey(req.headers);

  const card = await deps.repo.getCardById(payload.cardId);
  if (!card) {
    throw new AppError('CARD_NOT_FOUND', 'Card not found.', 404);
  }

  const timestamp = nowIso(deps);
  const requestHash = idempotencyKey ? computeAlertRequestHash(payload) : undefined;
  const alert = toAlertResponse(userId, payload, timestamp, requestHash);

  const createdAlert = idempotencyKey
    ? await createWithIdempotency(deps, alert, idempotencyKey, requestHash as string)
    : await (async () => {
      try {
        await deps.alertsRepo.createAlert(alert);
        return alert;
      } catch (error) {
        if (isConditionalWriteConflict(error)) {
          throw new AppError('CONFLICT', 'Unable to create alert due to conflicting write.', 409);
        }
        throw error;
      }
    })();

  return jsonResponse(201, createSuccess(createdAlert));
}
