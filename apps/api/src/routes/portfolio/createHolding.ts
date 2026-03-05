import {
  AppError,
  createHoldingRequestSchema,
  createSuccess,
  idempotencyKeyHeaderSchema,
  type CreateHoldingRequest,
  type HoldingResponse
} from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import type { ApiDependencies } from '../../dependencies';
import { isConditionalWriteConflict } from '../../data/portfolio-repository';
import { getUserIdFromHeaders } from '../../middleware/auth';
import { parseJsonBody, type RequestContext } from '../../middleware/request';
import { jsonResponse } from '../../middleware/response';
import { computeHoldingRequestHash } from './utils';

function validationError(
  message: string,
  details: Record<string, string[]>
): AppError {
  return new AppError('VALIDATION_ERROR', message, 422, details);
}

function parseCreateHoldingRequest(body: string | undefined): CreateHoldingRequest {
  const parsed = createHoldingRequestSchema.safeParse(parseJsonBody(body));
  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'body';
      details[key] = details[key] ?? [];
      details[key].push(issue.message);
    }
    throw validationError('Invalid holding payload.', details);
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

function toHoldingResponse(
  userId: string,
  payload: CreateHoldingRequest,
  createdAt: string,
  requestHash?: string
): HoldingResponse {
  const holding: HoldingResponse = {
    holdingId: ulid(),
    userId,
    cardId: payload.cardId,
    qty: payload.qty,
    variant: payload.variant,
    grade: payload.grade,
    condition: payload.condition,
    buyPriceCents: payload.buyPriceCents,
    buyDate: payload.buyDate,
    createdAt,
    updatedAt: createdAt,
    version: 1
  };

  if (payload.notes !== undefined) {
    holding.notes = payload.notes;
  }

  if (requestHash !== undefined) {
    holding.requestHash = requestHash;
  }

  return holding;
}

async function createWithIdempotency(
  deps: ApiDependencies,
  holding: HoldingResponse,
  idempotencyKey: string,
  requestHash: string
): Promise<HoldingResponse> {
  try {
    await deps.portfolioRepo.createHoldingWithIdempotency({
      holding,
      idempotencyKey,
      requestHash
    });
    return holding;
  } catch (error) {
    if (!isConditionalWriteConflict(error)) {
      throw error;
    }

    const alias = await deps.portfolioRepo.getIdempotencyAlias(holding.userId, idempotencyKey);

    if (!alias) {
      throw new AppError('CONFLICT', 'Unable to create holding due to conflicting write.', 409);
    }

    if (alias.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key is already used with a different payload.',
        409
      );
    }

    const existingHolding = await deps.portfolioRepo.getHolding(holding.userId, alias.holdingId);
    if (!existingHolding) {
      throw new AppError('CONFLICT', 'Idempotent holding record is missing.', 409);
    }

    return existingHolding;
  }
}

export async function createHoldingRoute(
  req: RequestContext,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const userId = getUserIdFromHeaders(req.headers);
  const payload = parseCreateHoldingRequest(req.body);
  const idempotencyKey = parseIdempotencyKey(req.headers);

  const card = await deps.repo.getCardById(payload.cardId);
  if (!card) {
    throw new AppError('CARD_NOT_FOUND', 'Card not found.', 404);
  }

  const timestamp = nowIso(deps);
  const requestHash = idempotencyKey ? computeHoldingRequestHash(payload) : undefined;

  const holding = toHoldingResponse(userId, payload, timestamp, requestHash);

  const createdHolding = idempotencyKey
    ? await createWithIdempotency(deps, holding, idempotencyKey, requestHash as string)
    : await (async () => {
      try {
        await deps.portfolioRepo.createHolding(holding);
        return holding;
      } catch (error) {
        if (isConditionalWriteConflict(error)) {
          throw new AppError('CONFLICT', 'Unable to create holding due to conflicting write.', 409);
        }
        throw error;
      }
    })();

  return jsonResponse(201, createSuccess(createdHolding));
}
