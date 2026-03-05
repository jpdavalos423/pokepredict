import {
  AppError,
  cardsListQuerySchema,
  createSuccess,
  CursorValidationError,
  decodeAndValidateCursor,
  encodeCursor,
  type CursorIndex,
  type CursorPayloadParams
} from '@pokepredict/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiDependencies } from '../../dependencies';
import type { RequestContext } from '../../middleware/request';
import { jsonResponse } from '../../middleware/response';

function normalizeSearchTerm(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validationError(
  message: string,
  details: Record<string, string[]>
): AppError {
  return new AppError('VALIDATION_ERROR', message, 422, details);
}

export async function listCardsRoute(
  req: RequestContext,
  deps: ApiDependencies
): Promise<APIGatewayProxyResultV2> {
  const parsed = cardsListQuerySchema.safeParse({
    set: req.query.set,
    query: req.query.query,
    limit: req.query.limit,
    cursor: req.query.cursor
  });

  if (!parsed.success) {
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'query';
      details[key] = details[key] ?? [];
      details[key].push(issue.message);
    }
    throw validationError('Invalid cards query parameters.', details);
  }

  const { set, query, limit, cursor } = parsed.data;

  const normalizedQuery = query ? normalizeSearchTerm(query) : undefined;
  if (query && !normalizedQuery) {
    throw validationError('Invalid cards query parameters.', {
      query: ['Query must include at least one alphanumeric character.']
    });
  }

  if (!set && normalizedQuery && normalizedQuery.length < 2) {
    throw validationError('Invalid cards query parameters.', {
      query: ['Query must be at least 2 characters when set is omitted.']
    });
  }

  if (!set && !normalizedQuery) {
    throw validationError('Invalid cards query parameters.', {
      query: ['Query is required when set is omitted.']
    });
  }

  if (set && normalizedQuery && normalizedQuery.length < 1) {
    throw validationError('Invalid cards query parameters.', {
      query: ['Query must be at least 1 character when set is present.']
    });
  }

  const queryForPrefix = normalizedQuery;

  const index: CursorIndex = set ? 'gsi1' : 'gsi2';
  const params: CursorPayloadParams = {
    set,
    query: normalizedQuery
  };

  let exclusiveStartKey: Record<string, unknown> | undefined;

  if (cursor) {
    try {
      const decoded = decodeAndValidateCursor(cursor, deps.cursorSigningSecret, {
        route: '/cards',
        index,
        params,
        limit
      });
      exclusiveStartKey = decoded.lek;
    } catch (error) {
      if (error instanceof CursorValidationError) {
        throw new AppError('INVALID_CURSOR', 'Invalid cursor token.', 400);
      }
      throw error;
    }
  }

  const page = set
    ? await deps.repo.listCardsBySet({
        setId: set,
        limit,
        ...(normalizedQuery ? { normalizedQuery } : {}),
        ...(exclusiveStartKey ? { exclusiveStartKey } : {})
      })
    : await deps.repo.listCardsByNamePrefix({
        normalizedQuery: queryForPrefix as string,
        limit,
        ...(exclusiveStartKey ? { exclusiveStartKey } : {})
      });

  const nextCursor = page.lastEvaluatedKey
    ? encodeCursor(
        {
          v: 1,
          route: '/cards',
          index,
          params,
          limit,
          lek: page.lastEvaluatedKey
        },
        deps.cursorSigningSecret
      )
    : null;

  return jsonResponse(
    200,
    createSuccess({
      items: page.items,
      cursor: nextCursor
    })
  );
}
