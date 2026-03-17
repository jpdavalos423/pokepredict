import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';
import {
  extractTcgdexSetIdsFromSeriesPayload,
  extractSetIdFromCardId,
  extractTcgdexSetSummaries,
  isExcludedSetId,
  parseTcgdexPagination,
  parseCsvList,
  type TcgdexSetSummary,
  resolveExcludedSetIdsFromPayload
} from '../apps/pipeline/src/providers/tcgdex-scope';

interface PurgeConfig {
  region: string;
  baseUrl: string;
  setsPath: string;
  excludedSeriesIds: string[];
  execute: boolean;
  outputPath: string;
  tables: {
    cards: string;
    prices: string;
    latestPrices: string;
    holdings: string;
    alertsByUser: string;
    alertsByCard: string;
    signals: string;
  };
}

interface Key {
  pk: string;
  sk: string;
}

interface DeleteWriteRequest {
  DeleteRequest: {
    Key: {
      pk: string;
      sk: string;
    };
  };
}

const TCGDEX_SETS_PAGE_SIZE = 250;
const TCGDEX_SETS_MAX_PAGES = 100;
const TCGDEX_SET_DETAIL_CONCURRENCY = 10;
const TCGDEX_SERIES_DETAIL_CONCURRENCY = 4;

interface HoldingRecord {
  userId: string;
  holdingId: string;
}

interface PurgeReport {
  generatedAt: string;
  mode: 'dry-run' | 'execute';
  region: string;
  baseUrl: string;
  setsPath: string;
  excludedSeriesIds: string[];
  excludedSetIds: string[];
  counts: {
    targetCardCount: number;
    cardsDeleteCount: number;
    latestPricesDeleteCount: number;
    pricesDeleteCount: number;
    signalsDeleteCount: number;
    alertsByCardDeleteCount: number;
    alertsByUserDeleteCount: number;
    alertAliasDeleteCount: number;
    holdingsDeleteCount: number;
    holdingAliasDeleteCount: number;
    totalDeleteRequests: number;
    totalBatchWrites: number;
  };
  samples: {
    cardIds: string[];
    setIds: string[];
    alertIds: string[];
    holdingIds: string[];
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseArgs(argv: string[]): { execute: boolean; outputPath?: string } {
  let execute = false;
  let outputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execute') {
      execute = true;
      continue;
    }
    if (arg === '--dry-run') {
      execute = false;
      continue;
    }
    if (arg === '--output') {
      outputPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--help') {
      console.log('Usage: tsx scripts/purge-tcgp-cards.ts [--dry-run|--execute] [--output <path>]');
      process.exit(0);
    }
  }

  return { execute, outputPath };
}

function defaultOutputPath(execute: boolean): string {
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  const mode = execute ? 'execute' : 'dry-run';
  return path.join('docs', 'reports', `tcgp-purge-${mode}-${stamp}.json`);
}

function buildConfig(): PurgeConfig {
  const args = parseArgs(process.argv.slice(2));
  return {
    region: process.env.AWS_REGION ?? 'us-west-2',
    baseUrl: process.env.TCGDEX_BASE_URL ?? 'https://api.tcgdex.net/v2/en',
    setsPath: process.env.TCGDEX_SETS_PATH ?? '/sets',
    excludedSeriesIds: parseCsvList(process.env.TCGDEX_EXCLUDED_SERIES_IDS ?? 'tcgp'),
    execute: args.execute,
    outputPath: args.outputPath ?? defaultOutputPath(args.execute),
    tables: {
      cards: required('TABLE_CARDS'),
      prices: required('TABLE_PRICES'),
      latestPrices: required('TABLE_LATEST_PRICES'),
      holdings: required('TABLE_HOLDINGS'),
      alertsByUser: required('TABLE_ALERTS_BY_USER'),
      alertsByCard: required('TABLE_ALERTS_BY_CARD'),
      signals: required('TABLE_SIGNALS')
    }
  };
}

function buildApiUrl(baseUrl: string, pathValue: string): URL {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = pathValue.startsWith('/') ? pathValue.slice(1) : pathValue;
  return new URL(normalizedPath, normalizedBase);
}

function buildSetDetailUrl(config: PurgeConfig, setId: string): URL {
  const setsPath = config.setsPath.endsWith('/') ? config.setsPath.slice(0, -1) : config.setsPath;
  return buildApiUrl(config.baseUrl, `${setsPath}/${encodeURIComponent(setId)}`);
}

function buildSeriesDetailUrl(config: PurgeConfig, seriesId: string): URL {
  return buildApiUrl(config.baseUrl, `/series/${encodeURIComponent(seriesId)}`);
}

function hasSeriesMetadata(setSummary: TcgdexSetSummary): boolean {
  return typeof setSummary.serie?.id === 'string' || typeof setSummary.series?.id === 'string';
}

async function requestJson(url: URL): Promise<unknown> {
  const response = await fetch(url.toString(), { method: 'GET' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url.toString()}`);
  }
  return response.json();
}

async function resolveExcludedSetIds(config: PurgeConfig): Promise<Set<string>> {
  if (config.excludedSeriesIds.length === 0) {
    return new Set<string>();
  }

  const seriesResolved = await resolveExcludedSetIdsFromSeriesEndpoints(config);
  const excludedSetIds = new Set<string>(seriesResolved.excludedSetIds);
  let unmatchedSeries = config.excludedSeriesIds.filter(
    (seriesId) => !seriesResolved.matchedSeriesIds.has(seriesId)
  );
  if (unmatchedSeries.length === 0) {
    return excludedSetIds;
  }

  let setSummaries = await fetchAllSets(config);
  let resolved = resolveExcludedSetIdsFromPayload(setSummaries, unmatchedSeries);

  if (resolved.totalSetsParsed === 0) {
    throw new Error('Failed to resolve excluded sets: /sets payload contained no set entries.');
  }

  unmatchedSeries = unmatchedSeries.filter((seriesId) => !resolved.matchedSeriesIds.has(seriesId));
  if (unmatchedSeries.length > 0 && setSummaries.some((summary) => !hasSeriesMetadata(summary))) {
    setSummaries = await hydrateSetSeriesMetadata(config, setSummaries);
    resolved = resolveExcludedSetIdsFromPayload(setSummaries, unmatchedSeries);
    unmatchedSeries = unmatchedSeries.filter((seriesId) => !resolved.matchedSeriesIds.has(seriesId));
  }

  if (unmatchedSeries.length > 0) {
    throw new Error(
      `Failed to resolve excluded sets: no sets found for excluded series ${unmatchedSeries.join(', ')}.`
    );
  }

  for (const setId of resolved.excludedSetIds) {
    excludedSetIds.add(setId);
  }

  return excludedSetIds;
}

async function fetchAllSets(config: PurgeConfig): Promise<TcgdexSetSummary[]> {
  const setsById = new Map<string, TcgdexSetSummary>();
  let page = 1;
  let pagesFetched = 0;
  let hasNextPage = true;

  while (hasNextPage && pagesFetched < TCGDEX_SETS_MAX_PAGES) {
    const url = buildApiUrl(config.baseUrl, config.setsPath);
    url.searchParams.set('pagination:page', String(page));
    url.searchParams.set('pagination:itemsPerPage', String(TCGDEX_SETS_PAGE_SIZE));

    const payload = await requestJson(url);
    const summaries = extractTcgdexSetSummaries(payload);

    const beforeCount = setsById.size;
    for (const summary of summaries) {
      if (typeof summary.id !== 'string' || summary.id.trim().length === 0) {
        continue;
      }
      setsById.set(summary.id.trim().toLowerCase(), summary);
    }

    const pagination = parseTcgdexPagination(payload, page, summaries.length);
    hasNextPage = pagination.hasNextPage;

    if (setsById.size === beforeCount && !pagination.nextPage) {
      hasNextPage = false;
    }

    const nextPage = pagination.nextPage ?? page + 1;
    if (nextPage <= page) {
      hasNextPage = false;
    } else {
      page = nextPage;
    }

    pagesFetched += 1;
  }

  return [...setsById.values()];
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const workerCount = Math.min(concurrency, items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        await worker(items[index] as T, index);
      }
    })
  );
}

async function hydrateSetSeriesMetadata(
  config: PurgeConfig,
  summaries: TcgdexSetSummary[]
): Promise<TcgdexSetSummary[]> {
  const hydrated = [...summaries];

  await runWithConcurrency(hydrated, TCGDEX_SET_DETAIL_CONCURRENCY, async (summary, index) => {
    if (typeof summary.id !== 'string' || summary.id.trim().length === 0 || hasSeriesMetadata(summary)) {
      return;
    }

    const setId = summary.id;
    let payload: unknown;
    try {
      payload = await requestJson(buildSetDetailUrl(config, setId));
    } catch (error) {
      throw new Error(
        `Failed to resolve excluded set detail for ${setId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (typeof payload !== 'object' || payload === null) {
      return;
    }

    const detail = payload as TcgdexSetSummary;
    hydrated[index] = {
      ...summary,
      ...detail,
      id: typeof detail.id === 'string' && detail.id.trim().length > 0 ? detail.id : summary.id
    };
  });

  return hydrated;
}

async function resolveExcludedSetIdsFromSeriesEndpoints(
  config: PurgeConfig
): Promise<{ excludedSetIds: Set<string>; matchedSeriesIds: Set<string> }> {
  const excludedSetIds = new Set<string>();
  const matchedSeriesIds = new Set<string>();

  await runWithConcurrency(config.excludedSeriesIds, TCGDEX_SERIES_DETAIL_CONCURRENCY, async (seriesId) => {
    let payload: unknown;
    try {
      payload = await requestJson(buildSeriesDetailUrl(config, seriesId));
    } catch {
      return;
    }

    const setIds = extractTcgdexSetIdsFromSeriesPayload(payload);
    if (setIds.size === 0) {
      return;
    }

    matchedSeriesIds.add(seriesId);
    for (const setId of setIds) {
      excludedSetIds.add(setId);
    }
  });

  return {
    excludedSetIds,
    matchedSeriesIds
  };
}

async function queryAllItems(
  ddb: DynamoDBDocumentClient,
  input: {
    tableName: string;
    indexName?: string;
    keyConditionExpression: string;
    expressionAttributeValues: Record<string, unknown>;
    projectionExpression?: string;
    expressionAttributeNames?: Record<string, string>;
  }
): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await ddb.send(
      new QueryCommand({
        TableName: input.tableName,
        IndexName: input.indexName,
        KeyConditionExpression: input.keyConditionExpression,
        ExpressionAttributeValues: input.expressionAttributeValues,
        ExpressionAttributeNames: input.expressionAttributeNames,
        ProjectionExpression: input.projectionExpression,
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    for (const item of response.Items ?? []) {
      items.push(item as Record<string, unknown>);
    }

    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

async function scanAllHoldings(
  ddb: DynamoDBDocumentClient,
  tableName: string
): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'pk, sk, entityType, cardId, holdingId, userId',
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    for (const item of response.Items ?? []) {
      items.push(item as Record<string, unknown>);
    }

    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

async function scanAllCards(
  ddb: DynamoDBDocumentClient,
  tableName: string
): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'pk, sk, cardId, setId',
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    for (const item of response.Items ?? []) {
      items.push(item as Record<string, unknown>);
    }

    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function dedupeKeys(keys: Key[]): Key[] {
  const byCompositeKey = new Map<string, Key>();
  for (const key of keys) {
    byCompositeKey.set(`${key.pk}|${key.sk}`, key);
  }
  return [...byCompositeKey.values()];
}

async function batchDeleteKeys(
  ddb: DynamoDBDocumentClient,
  tableName: string,
  keys: Key[]
): Promise<number> {
  if (keys.length === 0) {
    return 0;
  }

  let writeCount = 0;
  const requests = keys.map<DeleteWriteRequest>((key) => ({
    DeleteRequest: {
      Key: {
        pk: key.pk,
        sk: key.sk
      }
    }
  }));

  for (const requestChunk of chunk(requests, 25)) {
    let unprocessed = requestChunk;
    while (unprocessed.length > 0) {
      const response = await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: unprocessed
          }
        })
      );

      writeCount += 1;
      unprocessed = (response.UnprocessedItems?.[tableName] ?? []) as DeleteWriteRequest[];
    }
  }

  return writeCount;
}

async function run(): Promise<void> {
  const config = buildConfig();
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));

  const excludedSetIds = await resolveExcludedSetIds(config);
  const sortedSetIds = [...excludedSetIds].sort();

  const targetCardIds = new Set<string>();
  const cardsDeleteKeys: Key[] = [];

  const cardItems = await scanAllCards(ddb, config.tables.cards);
  for (const item of cardItems) {
    const cardId = asString(item.cardId);
    const pk = asString(item.pk);
    const sk = asString(item.sk);
    if (!cardId || !pk || !sk) {
      continue;
    }

    const setIdFromItem = asString(item.setId);
    const resolvedSetId = setIdFromItem ?? extractSetIdFromCardId(cardId);
    if (!isExcludedSetId(resolvedSetId, excludedSetIds)) {
      continue;
    }

    targetCardIds.add(cardId);
    cardsDeleteKeys.push({ pk, sk });
  }

  const latestDeleteKeys: Key[] = [];
  const pricesDeleteKeys: Key[] = [];
  const signalsDeleteKeys: Key[] = [];
  const alertsByCardDeleteKeys: Key[] = [];
  const alertsByUserDeleteKeys: Key[] = [];

  const alertsByUserIds = new Map<string, Set<string>>();

  for (const cardId of targetCardIds) {
    const cardPk = `CARD#${cardId}`;

    const latest = await ddb.send(
      new GetCommand({
        TableName: config.tables.latestPrices,
        Key: {
          pk: cardPk,
          sk: 'LATEST'
        },
        ProjectionExpression: 'pk, sk'
      })
    );

    const latestPk = asString(latest.Item?.pk);
    const latestSk = asString(latest.Item?.sk);
    if (latestPk && latestSk) {
      latestDeleteKeys.push({ pk: latestPk, sk: latestSk });
    }

    const prices = await queryAllItems(ddb, {
      tableName: config.tables.prices,
      keyConditionExpression: 'pk = :pk',
      expressionAttributeValues: {
        ':pk': cardPk
      },
      projectionExpression: 'pk, sk'
    });

    for (const item of prices) {
      const pk = asString(item.pk);
      const sk = asString(item.sk);
      if (pk && sk) {
        pricesDeleteKeys.push({ pk, sk });
      }
    }

    const signals = await queryAllItems(ddb, {
      tableName: config.tables.signals,
      keyConditionExpression: 'pk = :pk',
      expressionAttributeValues: {
        ':pk': cardPk
      },
      projectionExpression: 'pk, sk'
    });

    for (const item of signals) {
      const pk = asString(item.pk);
      const sk = asString(item.sk);
      if (pk && sk) {
        signalsDeleteKeys.push({ pk, sk });
      }
    }

    const alerts = await queryAllItems(ddb, {
      tableName: config.tables.alertsByCard,
      keyConditionExpression: 'pk = :pk',
      expressionAttributeValues: {
        ':pk': cardPk
      },
      projectionExpression: 'pk, sk, alertId, userId'
    });

    for (const item of alerts) {
      const pk = asString(item.pk);
      const sk = asString(item.sk);
      const alertId = asString(item.alertId);
      const userId = asString(item.userId);
      if (pk && sk) {
        alertsByCardDeleteKeys.push({ pk, sk });
      }
      if (alertId && userId) {
        alertsByUserDeleteKeys.push({
          pk: `USER#${userId}`,
          sk: `ALERT#${alertId}`
        });

        const userAlertIds = alertsByUserIds.get(userId) ?? new Set<string>();
        userAlertIds.add(alertId);
        alertsByUserIds.set(userId, userAlertIds);
      }
    }
  }

  const alertAliasDeleteKeys: Key[] = [];
  for (const [userId, alertIds] of alertsByUserIds) {
    const aliasItems = await queryAllItems(ddb, {
      tableName: config.tables.alertsByUser,
      keyConditionExpression: 'pk = :pk AND begins_with(sk, :idemPrefix)',
      expressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':idemPrefix': 'IDEMP#'
      },
      projectionExpression: 'pk, sk, alertId'
    });

    for (const item of aliasItems) {
      const aliasAlertId = asString(item.alertId);
      const pk = asString(item.pk);
      const sk = asString(item.sk);
      if (!aliasAlertId || !pk || !sk) {
        continue;
      }
      if (alertIds.has(aliasAlertId)) {
        alertAliasDeleteKeys.push({ pk, sk });
      }
    }
  }

  const holdingItems = await scanAllHoldings(ddb, config.tables.holdings);
  const holdingDeleteKeys: Key[] = [];
  const holdingRecords: HoldingRecord[] = [];

  for (const item of holdingItems) {
    const entityType = asString(item.entityType);
    if (entityType !== 'HOLDING') {
      continue;
    }

    const cardId = asString(item.cardId);
    if (!cardId || !targetCardIds.has(cardId)) {
      continue;
    }

    const pk = asString(item.pk);
    const sk = asString(item.sk);
    const userId = asString(item.userId);
    const holdingId = asString(item.holdingId);
    if (!pk || !sk || !userId || !holdingId) {
      continue;
    }

    holdingDeleteKeys.push({ pk, sk });
    holdingRecords.push({ userId, holdingId });
  }

  const holdingAliasDeleteKeys: Key[] = [];
  const holdingIdsByUser = new Map<string, Set<string>>();
  for (const holding of holdingRecords) {
    const set = holdingIdsByUser.get(holding.userId) ?? new Set<string>();
    set.add(holding.holdingId);
    holdingIdsByUser.set(holding.userId, set);
  }

  for (const [userId, holdingIds] of holdingIdsByUser) {
    const aliasItems = await queryAllItems(ddb, {
      tableName: config.tables.holdings,
      keyConditionExpression: 'pk = :pk AND begins_with(sk, :idemPrefix)',
      expressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':idemPrefix': 'IDEMP#'
      },
      projectionExpression: 'pk, sk, holdingId'
    });

    for (const item of aliasItems) {
      const aliasHoldingId = asString(item.holdingId);
      const pk = asString(item.pk);
      const sk = asString(item.sk);
      if (!aliasHoldingId || !pk || !sk) {
        continue;
      }
      if (holdingIds.has(aliasHoldingId)) {
        holdingAliasDeleteKeys.push({ pk, sk });
      }
    }
  }

  const deletePlan = {
    cards: dedupeKeys(cardsDeleteKeys),
    latestPrices: dedupeKeys(latestDeleteKeys),
    prices: dedupeKeys(pricesDeleteKeys),
    signals: dedupeKeys(signalsDeleteKeys),
    alertsByCard: dedupeKeys(alertsByCardDeleteKeys),
    alertsByUser: dedupeKeys(alertsByUserDeleteKeys),
    alertAliases: dedupeKeys(alertAliasDeleteKeys),
    holdings: dedupeKeys(holdingDeleteKeys),
    holdingAliases: dedupeKeys(holdingAliasDeleteKeys)
  };

  let totalBatchWrites = 0;
  if (config.execute) {
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.cards, deletePlan.cards);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.latestPrices, deletePlan.latestPrices);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.prices, deletePlan.prices);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.signals, deletePlan.signals);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.alertsByCard, deletePlan.alertsByCard);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.alertsByUser, deletePlan.alertsByUser);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.alertsByUser, deletePlan.alertAliases);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.holdings, deletePlan.holdings);
    totalBatchWrites += await batchDeleteKeys(ddb, config.tables.holdings, deletePlan.holdingAliases);
  }

  const report: PurgeReport = {
    generatedAt: new Date().toISOString(),
    mode: config.execute ? 'execute' : 'dry-run',
    region: config.region,
    baseUrl: config.baseUrl,
    setsPath: config.setsPath,
    excludedSeriesIds: config.excludedSeriesIds,
    excludedSetIds: sortedSetIds,
    counts: {
      targetCardCount: targetCardIds.size,
      cardsDeleteCount: deletePlan.cards.length,
      latestPricesDeleteCount: deletePlan.latestPrices.length,
      pricesDeleteCount: deletePlan.prices.length,
      signalsDeleteCount: deletePlan.signals.length,
      alertsByCardDeleteCount: deletePlan.alertsByCard.length,
      alertsByUserDeleteCount: deletePlan.alertsByUser.length,
      alertAliasDeleteCount: deletePlan.alertAliases.length,
      holdingsDeleteCount: deletePlan.holdings.length,
      holdingAliasDeleteCount: deletePlan.holdingAliases.length,
      totalDeleteRequests:
        deletePlan.cards.length +
        deletePlan.latestPrices.length +
        deletePlan.prices.length +
        deletePlan.signals.length +
        deletePlan.alertsByCard.length +
        deletePlan.alertsByUser.length +
        deletePlan.alertAliases.length +
        deletePlan.holdings.length +
        deletePlan.holdingAliases.length,
      totalBatchWrites
    },
    samples: {
      cardIds: [...targetCardIds].sort().slice(0, 25),
      setIds: sortedSetIds.slice(0, 25),
      alertIds: [...new Set([...alertsByUserIds.values()].flatMap((set) => [...set]))].slice(0, 25),
      holdingIds: [...new Set(holdingRecords.map((record) => record.holdingId))].slice(0, 25)
    }
  };

  mkdirSync(path.dirname(config.outputPath), { recursive: true });
  writeFileSync(config.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        level: 'info',
        script: 'purge-tcgp-cards',
        mode: report.mode,
        outputPath: config.outputPath,
        report
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
