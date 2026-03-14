import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import {
  type FetchRawResult,
  fetchRawResultSchema,
  type NormalizeResult,
  normalizeResultSchema,
  type NormalizedPriceRecord,
  rawFetchPayloadSchema,
  type RawFetchPayload,
  type RawPriceRecord
} from '@pokepredict/shared';
import { loadPipelineConfig } from '../config/env';
import {
  isIncomingAsOfNewer,
  logInfo,
  logWarn,
  streamToString,
  toCents
} from './common';

const SKIP_RATIO_FAIL_THRESHOLD = 0.2;

export interface NormalizeDependencies {
  now: () => string;
  readRawPayload: (rawS3Key: string) => Promise<RawFetchPayload>;
  cardExists: (cardId: string) => Promise<boolean>;
  putPricePoint: (record: NormalizedPriceRecord, timestamp: string) => Promise<void>;
  getLatestAsOf: (cardId: string) => Promise<string | undefined>;
  upsertLatestPrice: (
    record: NormalizedPriceRecord,
    asOf: string,
    timestamp: string
  ) => Promise<boolean>;
}

export function toNormalizedPriceRecord(
  input: RawPriceRecord & { lowPrice?: number | undefined; highPrice?: number | undefined },
  source: string,
  runId: string
): NormalizedPriceRecord {
  const normalized: NormalizedPriceRecord = {
    cardId: input.sourceCardId,
    ts: input.recordedAt,
    marketCents: Math.round(input.marketPrice * 100),
    currency: input.currency,
    source,
    runId
  };

  const lowCents = toCents(input.lowPrice);
  const highCents = toCents(input.highPrice);

  if (lowCents !== undefined) {
    normalized.lowCents = lowCents;
  }

  if (highCents !== undefined) {
    normalized.highCents = highCents;
  }

  return normalized;
}

export function buildPricePointItem(
  record: NormalizedPriceRecord,
  timestamp: string
): Record<string, string | number> {
  const item: Record<string, string | number> = {
    pk: `CARD#${record.cardId}`,
    sk: `TS#${record.ts}`,
    cardId: record.cardId,
    ts: record.ts,
    marketCents: record.marketCents,
    currency: record.currency,
    source: record.source,
    runId: record.runId,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1
  };

  if (record.lowCents !== undefined) {
    item.lowCents = record.lowCents;
  }

  if (record.highCents !== undefined) {
    item.highCents = record.highCents;
  }

  return item;
}

export function buildLatestPriceUpdate(
  record: NormalizedPriceRecord,
  asOf: string,
  timestamp: string
): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, string | number>;
} {
  const setExpressions = [
    'cardId = :cardId',
    'asOf = :asOf',
    'marketCents = :marketCents',
    'currency = :currency',
    '#source = :source',
    'runId = :runId',
    'updatedAt = :updatedAt',
    'createdAt = if_not_exists(createdAt, :createdAt)',
    'version = if_not_exists(version, :zero) + :one'
  ];

  const expressionAttributeValues: Record<string, string | number> = {
    ':cardId': record.cardId,
    ':asOf': asOf,
    ':marketCents': record.marketCents,
    ':currency': record.currency,
    ':source': record.source,
    ':runId': record.runId,
    ':updatedAt': timestamp,
    ':createdAt': timestamp,
    ':zero': 0,
    ':one': 1
  };

  if (record.lowCents !== undefined) {
    setExpressions.push('lowCents = :lowCents');
    expressionAttributeValues[':lowCents'] = record.lowCents;
  }

  if (record.highCents !== undefined) {
    setExpressions.push('highCents = :highCents');
    expressionAttributeValues[':highCents'] = record.highCents;
  }

  return {
    UpdateExpression: `SET ${setExpressions.join(', ')}`,
    ExpressionAttributeNames: {
      '#source': 'source'
    },
    ExpressionAttributeValues: expressionAttributeValues
  };
}

export function createNormalizeHandler(deps: NormalizeDependencies): (event: FetchRawResult) => Promise<NormalizeResult> {
  return async function normalizeHandler(event: FetchRawResult): Promise<NormalizeResult> {
    const normalizeStartedMs = Date.now();
    const input = fetchRawResultSchema.parse(event);
    const payload = rawFetchPayloadSchema.parse(await deps.readRawPayload(input.rawS3Key));

    const updatedCardIds = new Set<string>();
    let processedCount = 0;
    let skippedCount = 0;
    const skipReasonCounts: Record<string, number> = {};
    const timestamp = deps.now();

    for (const rawRecord of payload.records) {
      const cardId = rawRecord.sourceCardId;
      const exists = await deps.cardExists(cardId);

      if (!exists) {
        skippedCount += 1;
        skipReasonCounts['unknown card ID'] = (skipReasonCounts['unknown card ID'] ?? 0) + 1;
        logWarn('Skipping raw price record due to missing card mapping.', {
          step: 'Normalize',
          runId: input.runId,
          sourceCardId: cardId
        });
        continue;
      }

      const normalized = toNormalizedPriceRecord(rawRecord, input.source, input.runId);
      await deps.putPricePoint(normalized, timestamp);

      const currentLatestAsOf = await deps.getLatestAsOf(cardId);
      if (isIncomingAsOfNewer(currentLatestAsOf, input.asOf)) {
        await deps.upsertLatestPrice(normalized, input.asOf, timestamp);
      }

      processedCount += 1;
      updatedCardIds.add(cardId);
    }

    const totalRecords = payload.records.length;
    const skipRatio = totalRecords === 0 ? 0 : skippedCount / totalRecords;

    if (skipRatio > SKIP_RATIO_FAIL_THRESHOLD) {
      throw new Error(
        `Normalize mapping skip ratio ${skipRatio.toFixed(2)} exceeded threshold ${SKIP_RATIO_FAIL_THRESHOLD}`
      );
    }

    const result: NormalizeResult = {
      runId: input.runId,
      asOf: input.asOf,
      source: input.source,
      mode: input.mode,
      startedAt: input.startedAt,
      processedCount,
      updatedCardIds: [...updatedCardIds]
    };

    normalizeResultSchema.parse(result);

    logInfo('Normalized raw pricing payload into DynamoDB.', {
      step: 'Normalize',
      runId: input.runId,
      processedCount,
      skippedCount,
      totalRecords,
      normalizeSkipRatio: skipRatio,
      skipReasonCounts,
      updatedCardIds: result.updatedCardIds,
      runDurationMs: Date.now() - normalizeStartedMs
    });

    return result;
  };
}

function createDefaultDependencies(): NormalizeDependencies {
  const cfg = loadPipelineConfig();
  const s3 = new S3Client({ region: cfg.awsRegion });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: cfg.awsRegion }));

  return {
    now: () => new Date().toISOString(),
    readRawPayload: async (rawS3Key: string) => {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: cfg.rawBucket,
          Key: rawS3Key
        })
      );

      const body = await streamToString(response.Body);
      return JSON.parse(body) as RawFetchPayload;
    },
    cardExists: async (cardId: string) => {
      const response = await ddb.send(
        new GetCommand({
          TableName: cfg.tables.cards,
          Key: {
            pk: `CARD#${cardId}`,
            sk: 'META'
          }
        })
      );
      return Boolean(response.Item);
    },
    putPricePoint: async (record: NormalizedPriceRecord, timestamp: string) => {
      await ddb.send(
        new PutCommand({
          TableName: cfg.tables.prices,
          Item: buildPricePointItem(record, timestamp)
        })
      );
    },
    getLatestAsOf: async (cardId: string) => {
      const response = await ddb.send(
        new GetCommand({
          TableName: cfg.tables.latestPrices,
          Key: {
            pk: `CARD#${cardId}`,
            sk: 'LATEST'
          },
          ProjectionExpression: 'asOf'
        })
      );

      return typeof response.Item?.asOf === 'string' ? response.Item.asOf : undefined;
    },
    upsertLatestPrice: async (
      record: NormalizedPriceRecord,
      asOf: string,
      timestamp: string
    ) => {
      const update = buildLatestPriceUpdate(record, asOf, timestamp);
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: cfg.tables.latestPrices,
            Key: {
              pk: `CARD#${record.cardId}`,
              sk: 'LATEST'
            },
            UpdateExpression: update.UpdateExpression,
            ConditionExpression: 'attribute_not_exists(asOf) OR asOf < :asOf',
            ExpressionAttributeNames: update.ExpressionAttributeNames,
            ExpressionAttributeValues: update.ExpressionAttributeValues
          })
        );
        return true;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'ConditionalCheckFailedException' ||
            error.name === 'TransactionCanceledException')
        ) {
          return false;
        }
        throw error;
      }
    }
  };
}

let defaultHandler: ((event: FetchRawResult) => Promise<NormalizeResult>) | undefined;

export async function handler(event: FetchRawResult): Promise<NormalizeResult> {
  if (!defaultHandler) {
    defaultHandler = createNormalizeHandler(createDefaultDependencies());
  }
  return defaultHandler(event);
}
