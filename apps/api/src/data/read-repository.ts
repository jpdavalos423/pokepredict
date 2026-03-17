import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  CardDetail,
  CardListItem,
  LatestPriceResponse,
  PriceHistoryPoint,
  Signal
} from '@pokepredict/shared';
import type { ApiConfig } from '../config';

export interface ListCardsBySetInput {
  setId: string;
  normalizedQuery?: string;
  limit: number;
  exclusiveStartKey?: Record<string, unknown>;
}

export interface ListCardsByNamePrefixInput {
  normalizedQuery: string;
  limit: number;
  exclusiveStartKey?: Record<string, unknown>;
}

export interface PaginatedItems<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, unknown>;
}

export interface ApiReadRepository {
  listCardsBySet(input: ListCardsBySetInput): Promise<PaginatedItems<CardListItem>>;
  listCardsByNamePrefix(input: ListCardsByNamePrefixInput): Promise<PaginatedItems<CardListItem>>;
  getCardById(cardId: string): Promise<CardDetail | null>;
  getLatestPrice(cardId: string): Promise<LatestPriceResponse | null>;
  getPriceHistory(cardId: string, fromIso: string, toIso: string): Promise<PriceHistoryPoint[]>;
  getLatestSignal(cardId: string): Promise<Signal | null>;
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

function centsToUsdDecimal(cents: number): number {
  return cents / 100;
}

export function normalizeCardRarity(
  rarityValue: string | undefined,
  setName: string | undefined
): string | undefined {
  if (typeof rarityValue !== 'string') {
    return undefined;
  }

  const trimmedRarity = rarityValue.trim();
  if (!trimmedRarity) {
    return undefined;
  }

  if (trimmedRarity.toLowerCase() !== 'none') {
    return trimmedRarity;
  }

  const normalizedSetName = typeof setName === 'string' ? setName.trim().toLowerCase() : '';
  if (normalizedSetName.includes('promo')) {
    return 'Promo';
  }

  return undefined;
}

function toCardListItem(item: Record<string, unknown>): CardListItem {
  const card: CardListItem = {
    cardId: asString(item.cardId, 'cardId'),
    name: asString(item.name, 'name'),
    set: {
      id: asString(item.setId, 'setId'),
      name: asString(item.setName, 'setName')
    },
    number: asString(item.number, 'number')
  };

  const rarity = normalizeCardRarity(
    typeof item.rarity === 'string' ? item.rarity : undefined,
    card.set.name
  );
  if (rarity) {
    card.rarity = rarity;
  }

  if (typeof item.imageUrl === 'string') {
    card.imageUrl = item.imageUrl;
  }

  return card;
}

function toCardDetail(item: Record<string, unknown>): CardDetail {
  const card: CardDetail = {
    cardId: asString(item.cardId, 'cardId'),
    name: asString(item.name, 'name'),
    set: {
      id: asString(item.setId, 'setId'),
      name: asString(item.setName, 'setName')
    },
    number: asString(item.number, 'number')
  };

  const rarity = normalizeCardRarity(
    typeof item.rarity === 'string' ? item.rarity : undefined,
    card.set.name
  );
  if (rarity) {
    card.rarity = rarity;
  }

  if (typeof item.imageUrl === 'string') {
    card.imageUrl = item.imageUrl;
  }

  return card;
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

function toHistoryPoint(item: Record<string, unknown>): PriceHistoryPoint {
  const marketCents = asNumber(item.marketCents, 'marketCents');
  const point: PriceHistoryPoint = {
    ts: asString(item.ts, 'ts'),
    marketCents,
    marketPrice: centsToUsdDecimal(marketCents),
    currency: 'USD',
    source: asString(item.source, 'source')
  };

  const lowCents = asOptionalNumber(item.lowCents);
  if (lowCents !== undefined) {
    point.lowCents = lowCents;
  }

  const highCents = asOptionalNumber(item.highCents);
  if (highCents !== undefined) {
    point.highCents = highCents;
  }

  return point;
}

function toSignal(item: Record<string, unknown>): Signal {
  const signal: Signal = {
    cardId: asString(item.cardId, 'cardId'),
    asOfDate: asString(item.asOfDate, 'asOfDate'),
    ret7dBps: asNumber(item.ret7dBps, 'ret7dBps'),
    ret30dBps: asNumber(item.ret30dBps, 'ret30dBps'),
    vol30dBps: asNumber(item.vol30dBps, 'vol30dBps'),
    trend: asString(item.trend, 'trend') as Signal['trend']
  };

  const pred7dLowBps = asOptionalNumber(item.pred7dLowBps);
  if (pred7dLowBps !== undefined) {
    signal.pred7dLowBps = pred7dLowBps;
  }

  const pred7dHighBps = asOptionalNumber(item.pred7dHighBps);
  if (pred7dHighBps !== undefined) {
    signal.pred7dHighBps = pred7dHighBps;
  }

  return signal;
}

export class DynamoApiReadRepository implements ApiReadRepository {
  constructor(
    private readonly ddb: DynamoDBDocumentClient,
    private readonly cfg: ApiConfig
  ) {}

  async listCardsBySet(input: ListCardsBySetInput): Promise<PaginatedItems<CardListItem>> {
    const expressionValues: Record<string, unknown> = {
      ':gsi1pk': `SET#${input.setId}`
    };

    let filterExpression: string | undefined;
    if (input.normalizedQuery) {
      expressionValues[':queryPrefix'] = input.normalizedQuery;
      filterExpression = 'begins_with(normalizedName, :queryPrefix)';
    }

    const response = await this.ddb.send(
      new QueryCommand({
        TableName: this.cfg.tables.cards,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionValues,
        Limit: input.limit,
        ExclusiveStartKey: input.exclusiveStartKey
      })
    );

    const items = (response.Items ?? []).map((item) => toCardListItem(item as Record<string, unknown>));

    const result: PaginatedItems<CardListItem> = {
      items
    };
    if (response.LastEvaluatedKey) {
      result.lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown>;
    }

    return result;
  }

  async listCardsByNamePrefix(input: ListCardsByNamePrefixInput): Promise<PaginatedItems<CardListItem>> {
    const firstLetter = input.normalizedQuery.charAt(0) || '#';

    const response = await this.ddb.send(
      new QueryCommand({
        TableName: this.cfg.tables.cards,
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :gsi2pk AND begins_with(gsi2sk, :gsi2Prefix)',
        ExpressionAttributeValues: {
          ':gsi2pk': `NAME#${firstLetter}`,
          ':gsi2Prefix': `NAME#${input.normalizedQuery}`
        },
        Limit: input.limit,
        ExclusiveStartKey: input.exclusiveStartKey
      })
    );

    const items = (response.Items ?? []).map((item) => toCardListItem(item as Record<string, unknown>));

    const result: PaginatedItems<CardListItem> = {
      items
    };
    if (response.LastEvaluatedKey) {
      result.lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown>;
    }

    return result;
  }

  async getCardById(cardId: string): Promise<CardDetail | null> {
    const response = await this.ddb.send(
      new GetCommand({
        TableName: this.cfg.tables.cards,
        Key: {
          pk: `CARD#${cardId}`,
          sk: 'META'
        }
      })
    );

    if (!response.Item) {
      return null;
    }

    return toCardDetail(response.Item as Record<string, unknown>);
  }

  async getLatestPrice(cardId: string): Promise<LatestPriceResponse | null> {
    const response = await this.ddb.send(
      new GetCommand({
        TableName: this.cfg.tables.latestPrices,
        Key: {
          pk: `CARD#${cardId}`,
          sk: 'LATEST'
        }
      })
    );

    if (!response.Item) {
      return null;
    }

    return toLatestPrice(response.Item as Record<string, unknown>);
  }

  async getPriceHistory(cardId: string, fromIso: string, toIso: string): Promise<PriceHistoryPoint[]> {
    const response = await this.ddb.send(
      new QueryCommand({
        TableName: this.cfg.tables.prices,
        KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': `CARD#${cardId}`,
          ':from': `TS#${fromIso}`,
          ':to': `TS#${toIso}`
        },
        ScanIndexForward: true
      })
    );

    return (response.Items ?? []).map((item) => toHistoryPoint(item as Record<string, unknown>));
  }

  async getLatestSignal(cardId: string): Promise<Signal | null> {
    const response = await this.ddb.send(
      new QueryCommand({
        TableName: this.cfg.tables.signals,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': `CARD#${cardId}`
        },
        Limit: 1,
        ScanIndexForward: false
      })
    );

    const item = response.Items?.[0] as Record<string, unknown> | undefined;
    if (!item) {
      return null;
    }

    return toSignal(item);
  }
}
