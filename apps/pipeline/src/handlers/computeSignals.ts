import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import {
  computeSignalsResultSchema,
  normalizeResultSchema,
  type ComputeSignalsResult,
  type NormalizeResult,
  type PricePoint,
  type Signal,
  type TrendLabel
} from '@pokepredict/shared';
import { loadPipelineConfig } from '../config/env';
import { logInfo, logWarn } from './common';

const LOOKBACK_DAYS = 31;
const RET_7_DAYS = 7;
const RET_30_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PersistedSignal extends Signal {
  runId: string;
  source: string;
}

export interface ComputeSignalsDependencies {
  now: () => string;
  listPricePoints: (cardId: string, fromIso: string, toIso: string) => Promise<PricePoint[]>;
  upsertSignal: (record: PersistedSignal, timestamp: string) => Promise<void>;
}

function parseIsoMillis(value: string): number {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }
  return millis;
}

function toAsOfDate(asOfIso: string): string {
  return asOfIso.slice(0, 10);
}

function daysAgoIso(asOfIso: string, days: number): string {
  const asOfMillis = parseIsoMillis(asOfIso);
  return new Date(asOfMillis - days * DAY_MS).toISOString();
}

function sortByTimestamp(points: PricePoint[]): PricePoint[] {
  return [...points].sort((left, right) => left.ts.localeCompare(right.ts));
}

function latestAtOrBefore(points: PricePoint[], cutoffMillis: number): PricePoint | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (!point) {
      continue;
    }
    const pointMillis = parseIsoMillis(point.ts);
    if (pointMillis <= cutoffMillis) {
      return point;
    }
  }
  return undefined;
}

export function computeReturnBps(
  currentMarketCents: number | undefined,
  baselineMarketCents: number | undefined
): number {
  if (
    currentMarketCents === undefined ||
    baselineMarketCents === undefined ||
    baselineMarketCents <= 0
  ) {
    return 0;
  }

  return Math.round(((currentMarketCents - baselineMarketCents) / baselineMarketCents) * 10000);
}

export function computeVolatilityBps(points: PricePoint[]): number {
  const sorted = sortByTimestamp(points);
  const returns: number[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1];
    const curr = sorted[index];

    if (!prev || !curr || prev.marketCents <= 0) {
      continue;
    }

    returns.push(
      Math.round(((curr.marketCents - prev.marketCents) / prev.marketCents) * 10000)
    );
  }

  if (returns.length < 2) {
    return 0;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => {
    const delta = value - mean;
    return sum + delta * delta;
  }, 0) / returns.length;

  return Math.round(Math.sqrt(variance));
}

export function classifyTrend(ret30dBps: number): TrendLabel {
  if (ret30dBps >= 300) {
    return 'UPTREND';
  }

  if (ret30dBps <= -300) {
    return 'DOWNTREND';
  }

  return 'SIDEWAYS';
}

export function buildSignalRecord(
  cardId: string,
  asOfIso: string,
  source: string,
  runId: string,
  points: PricePoint[]
): PersistedSignal | null {
  const asOfMillis = parseIsoMillis(asOfIso);
  const sorted = sortByTimestamp(points).filter((point) => parseIsoMillis(point.ts) <= asOfMillis);

  const pNow = latestAtOrBefore(sorted, asOfMillis);
  if (!pNow) {
    return null;
  }

  const p7d = latestAtOrBefore(sorted, asOfMillis - RET_7_DAYS * DAY_MS);
  const p30d = latestAtOrBefore(sorted, asOfMillis - RET_30_DAYS * DAY_MS);

  const ret7dBps = computeReturnBps(pNow.marketCents, p7d?.marketCents);
  const ret30dBps = computeReturnBps(pNow.marketCents, p30d?.marketCents);
  const vol30dBps = computeVolatilityBps(sorted);

  return {
    cardId,
    asOfDate: toAsOfDate(asOfIso),
    ret7dBps,
    ret30dBps,
    vol30dBps,
    trend: classifyTrend(ret30dBps),
    runId,
    source
  };
}

export function createComputeSignalsHandler(
  deps: ComputeSignalsDependencies
): (event: NormalizeResult) => Promise<ComputeSignalsResult> {
  return async function computeSignalsHandler(event: NormalizeResult): Promise<ComputeSignalsResult> {
    const input = normalizeResultSchema.parse(event);
    const cardIds = [...new Set(input.updatedCardIds)];
    const fromIso = daysAgoIso(input.asOf, LOOKBACK_DAYS);
    const timestamp = deps.now();

    const writtenCardIds: string[] = [];
    let skippedCount = 0;

    for (const cardId of cardIds) {
      const points = await deps.listPricePoints(cardId, fromIso, input.asOf);
      const signal = buildSignalRecord(cardId, input.asOf, input.source, input.runId, points);

      if (!signal) {
        skippedCount += 1;
        logWarn('Skipping signal computation due to missing usable current price.', {
          step: 'ComputeSignals',
          runId: input.runId,
          cardId
        });
        continue;
      }

      await deps.upsertSignal(signal, timestamp);
      writtenCardIds.push(cardId);
    }

    const result: ComputeSignalsResult = {
      runId: input.runId,
      asOf: input.asOf,
      source: input.source,
      mode: input.mode,
      startedAt: input.startedAt,
      processedCount: writtenCardIds.length,
      updatedCardIds: writtenCardIds
    };

    computeSignalsResultSchema.parse(result);

    logInfo('Computed and persisted signal records.', {
      step: 'ComputeSignals',
      runId: input.runId,
      candidateCardCount: cardIds.length,
      processedCount: result.processedCount,
      skippedCount
    });

    return result;
  };
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

function toPricePoint(item: Record<string, unknown>): PricePoint {
  const point: PricePoint = {
    cardId: asString(item.cardId, 'cardId'),
    ts: asString(item.ts, 'ts'),
    marketCents: asNumber(item.marketCents, 'marketCents'),
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

function createDefaultDependencies(): ComputeSignalsDependencies {
  const cfg = loadPipelineConfig();
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: cfg.awsRegion }));

  return {
    now: () => new Date().toISOString(),
    listPricePoints: async (cardId: string, fromIso: string, toIso: string) => {
      const response = await ddb.send(
        new QueryCommand({
          TableName: cfg.tables.prices,
          KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
          ExpressionAttributeValues: {
            ':pk': `CARD#${cardId}`,
            ':from': `TS#${fromIso}`,
            ':to': `TS#${toIso}`
          },
          ScanIndexForward: true
        })
      );

      return (response.Items ?? []).map((item) => toPricePoint(item as Record<string, unknown>));
    },
    upsertSignal: async (record: PersistedSignal, timestamp: string) => {
      await ddb.send(
        new UpdateCommand({
          TableName: cfg.tables.signals,
          Key: {
            pk: `CARD#${record.cardId}`,
            sk: `ASOF#${record.asOfDate}`
          },
          UpdateExpression: [
            'SET cardId = :cardId',
            'asOfDate = :asOfDate',
            'ret7dBps = :ret7dBps',
            'ret30dBps = :ret30dBps',
            'vol30dBps = :vol30dBps',
            'trend = :trend',
            'runId = :runId',
            '#source = :source',
            'updatedAt = :updatedAt',
            'createdAt = if_not_exists(createdAt, :createdAt)',
            'version = if_not_exists(version, :zero) + :one'
          ].join(', '),
          ExpressionAttributeNames: {
            '#source': 'source'
          },
          ExpressionAttributeValues: {
            ':cardId': record.cardId,
            ':asOfDate': record.asOfDate,
            ':ret7dBps': record.ret7dBps,
            ':ret30dBps': record.ret30dBps,
            ':vol30dBps': record.vol30dBps,
            ':trend': record.trend,
            ':runId': record.runId,
            ':source': record.source,
            ':updatedAt': timestamp,
            ':createdAt': timestamp,
            ':zero': 0,
            ':one': 1
          }
        })
      );
    }
  };
}

let defaultHandler: ((event: NormalizeResult) => Promise<ComputeSignalsResult>) | undefined;

export async function handler(event: NormalizeResult): Promise<ComputeSignalsResult> {
  if (!defaultHandler) {
    defaultHandler = createComputeSignalsHandler(createDefaultDependencies());
  }

  return defaultHandler(event);
}
