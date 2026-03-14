import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  type DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import type { HoldingResponse, LatestPriceResponse } from '@pokepredict/shared';
import type { ApiConfig } from '../config';

export interface IdempotencyAliasRecord {
  userId: string;
  idempotencyKey: string;
  holdingId: string;
  requestHash: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  entityType: 'IDEMP';
}

export interface CreateHoldingWithIdempotencyInput {
  holding: HoldingResponse;
  idempotencyKey: string;
  requestHash: string;
}

export interface PortfolioRepository {
  createHolding(holding: HoldingResponse): Promise<void>;
  createHoldingWithIdempotency(input: CreateHoldingWithIdempotencyInput): Promise<void>;
  getHolding(userId: string, holdingId: string): Promise<HoldingResponse | null>;
  deleteHolding(userId: string, holdingId: string): Promise<void>;
  getIdempotencyAlias(userId: string, idempotencyKey: string): Promise<IdempotencyAliasRecord | null>;
  listHoldingsByUser(userId: string): Promise<HoldingResponse[]>;
  batchGetLatestPrices(cardIds: string[]): Promise<Map<string, LatestPriceResponse>>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required field ${field}.`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Missing required field ${field}.`);
  }
  return value;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value;
}

function centsToUsdDecimal(cents: number): number {
  return cents / 100;
}

function toHoldingResponse(item: Record<string, unknown>): HoldingResponse {
  const holding: HoldingResponse = {
    holdingId: asString(item.holdingId, 'holdingId'),
    userId: asString(item.userId, 'userId'),
    cardId: asString(item.cardId, 'cardId'),
    qty: asNumber(item.qty, 'qty'),
    variant: asString(item.variant, 'variant') as HoldingResponse['variant'],
    grade: typeof item.grade === 'string' || item.grade === null ? item.grade : null,
    condition: asString(item.condition, 'condition') as HoldingResponse['condition'],
    buyPriceCents: asNumber(item.buyPriceCents, 'buyPriceCents'),
    buyDate: asString(item.buyDate, 'buyDate'),
    createdAt: asString(item.createdAt, 'createdAt'),
    updatedAt: asString(item.updatedAt, 'updatedAt'),
    version: asNumber(item.version, 'version')
  };

  const notes = asOptionalString(item.notes);
  if (notes !== undefined) {
    holding.notes = notes;
  }

  const requestHash = asOptionalString(item.requestHash);
  if (requestHash !== undefined) {
    holding.requestHash = requestHash;
  }

  return holding;
}

function toLatestPrice(item: Record<string, unknown>): LatestPriceResponse {
  const marketCents = asNumber(item.marketCents, 'marketCents');
  const latest: LatestPriceResponse = {
    cardId: asString(item.cardId, 'cardId'),
    asOf: asString(item.asOf, 'asOf'),
    marketCents,
    marketPrice: centsToUsdDecimal(marketCents),
    currency: 'USD',
    source: asString(item.source, 'source')
  };

  const lowCents = asOptionalNumber(item.lowCents);
  if (lowCents !== undefined) {
    latest.lowCents = lowCents;
  }

  const highCents = asOptionalNumber(item.highCents);
  if (highCents !== undefined) {
    latest.highCents = highCents;
  }

  return latest;
}

function toIdempotencyAliasRecord(item: Record<string, unknown>): IdempotencyAliasRecord {
  return {
    userId: asString(item.userId, 'userId'),
    idempotencyKey: asString(item.idempotencyKey, 'idempotencyKey'),
    holdingId: asString(item.holdingId, 'holdingId'),
    requestHash: asString(item.requestHash, 'requestHash'),
    createdAt: asString(item.createdAt, 'createdAt'),
    updatedAt: asString(item.updatedAt, 'updatedAt'),
    version: asNumber(item.version, 'version'),
    entityType: 'IDEMP'
  };
}

function holdingToItem(holding: HoldingResponse): Record<string, unknown> {
  const item: Record<string, unknown> = {
    pk: `USER#${holding.userId}`,
    sk: `HOLDING#${holding.holdingId}`,
    entityType: 'HOLDING',
    holdingId: holding.holdingId,
    userId: holding.userId,
    cardId: holding.cardId,
    qty: holding.qty,
    variant: holding.variant,
    grade: holding.grade,
    condition: holding.condition,
    buyPriceCents: holding.buyPriceCents,
    buyDate: holding.buyDate,
    createdAt: holding.createdAt,
    updatedAt: holding.updatedAt,
    version: holding.version
  };

  if (holding.notes !== undefined) {
    item.notes = holding.notes;
  }

  if (holding.requestHash !== undefined) {
    item.requestHash = holding.requestHash;
  }

  return item;
}

function idempotencyAliasToItem(input: CreateHoldingWithIdempotencyInput): Record<string, unknown> {
  return {
    pk: `USER#${input.holding.userId}`,
    sk: `IDEMP#${input.idempotencyKey}`,
    entityType: 'IDEMP',
    userId: input.holding.userId,
    idempotencyKey: input.idempotencyKey,
    holdingId: input.holding.holdingId,
    requestHash: input.requestHash,
    createdAt: input.holding.createdAt,
    updatedAt: input.holding.updatedAt,
    version: 1
  };
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

export function isConditionalWriteConflict(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'ConditionalCheckFailedException' ||
    error.name === 'TransactionCanceledException'
  );
}

export class DynamoPortfolioRepository implements PortfolioRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly cfg: ApiConfig
  ) {}

  async createHolding(holding: HoldingResponse): Promise<void> {
    await this.ddb.send(
      new PutCommand({
        TableName: this.cfg.tables.holdings,
        Item: holdingToItem(holding),
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
      })
    );
  }

  async createHoldingWithIdempotency(input: CreateHoldingWithIdempotencyInput): Promise<void> {
    await this.ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.cfg.tables.holdings,
              Item: holdingToItem(input.holding),
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
            }
          },
          {
            Put: {
              TableName: this.cfg.tables.holdings,
              Item: idempotencyAliasToItem(input),
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
            }
          }
        ]
      })
    );
  }

  async getHolding(userId: string, holdingId: string): Promise<HoldingResponse | null> {
    const response = await this.ddb.send(
      new GetCommand({
        TableName: this.cfg.tables.holdings,
        Key: {
          pk: `USER#${userId}`,
          sk: `HOLDING#${holdingId}`
        }
      })
    );

    if (!response.Item) {
      return null;
    }

    return toHoldingResponse(response.Item as Record<string, unknown>);
  }

  async deleteHolding(userId: string, holdingId: string): Promise<void> {
    await this.ddb.send(
      new DeleteCommand({
        TableName: this.cfg.tables.holdings,
        Key: {
          pk: `USER#${userId}`,
          sk: `HOLDING#${holdingId}`
        },
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
      })
    );
  }

  async getIdempotencyAlias(
    userId: string,
    idempotencyKey: string
  ): Promise<IdempotencyAliasRecord | null> {
    const response = await this.ddb.send(
      new GetCommand({
        TableName: this.cfg.tables.holdings,
        Key: {
          pk: `USER#${userId}`,
          sk: `IDEMP#${idempotencyKey}`
        }
      })
    );

    if (!response.Item) {
      return null;
    }

    return toIdempotencyAliasRecord(response.Item as Record<string, unknown>);
  }

  async listHoldingsByUser(userId: string): Promise<HoldingResponse[]> {
    const response = await this.ddb.send(
      new QueryCommand({
        TableName: this.cfg.tables.holdings,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :holdingPrefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':holdingPrefix': 'HOLDING#'
        },
        ScanIndexForward: false
      })
    );

    return (response.Items ?? []).map((item) => toHoldingResponse(item as Record<string, unknown>));
  }

  async batchGetLatestPrices(cardIds: string[]): Promise<Map<string, LatestPriceResponse>> {
    const latestByCardId = new Map<string, LatestPriceResponse>();
    if (cardIds.length === 0) {
      return latestByCardId;
    }

    const uniqueCardIds = [...new Set(cardIds)];
    const chunks = chunk(uniqueCardIds, 100);

    for (const cardChunk of chunks) {
      let keys = cardChunk.map((cardId) => ({
        pk: `CARD#${cardId}`,
        sk: 'LATEST'
      }));

      while (keys.length > 0) {
        const response = await this.ddb.send(
          new BatchGetCommand({
            RequestItems: {
              [this.cfg.tables.latestPrices]: {
                Keys: keys
              }
            }
          })
        );

        const items = response.Responses?.[this.cfg.tables.latestPrices] ?? [];
        for (const item of items) {
          const parsed = toLatestPrice(item as Record<string, unknown>);
          latestByCardId.set(parsed.cardId, parsed);
        }

        const unprocessed = response.UnprocessedKeys?.[this.cfg.tables.latestPrices]?.Keys;
        keys = (unprocessed as Array<{ pk: string; sk: string }> | undefined) ?? [];
      }
    }

    return latestByCardId;
  }
}
